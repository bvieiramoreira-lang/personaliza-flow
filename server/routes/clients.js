const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { hashPassword } = require('../seed');

// GET /api/clients - Listar todos os clientes cadastrados com estatísticas
router.get('/', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }

  const query = `
    SELECT 
      c.id, c.name, c.email, c.cnpj_cpf, c.phone, c.role, c.status, c.created_at,
      c.parent_client_id, c.branch_number, c.can_access_flow, c.can_access_store,
      c.cep, c.address, c.address_number, c.complement, c.neighborhood, c.city, c.state,
      (SELECT p.name FROM clients p WHERE p.id = c.parent_client_id) as parent_name,
      (SELECT COUNT(*) FROM clients b WHERE b.parent_client_id = c.id) as total_branches,
      (SELECT COUNT(*) FROM products p WHERE p.client_id = c.id) as total_products,
      (SELECT COUNT(*) FROM shipments s WHERE s.client_id = c.id) as total_shipments,
      (SELECT COALESCE(SUM(s.final_freight_price), 0) FROM shipments s WHERE (s.client_id = c.id OR s.parent_client_id = c.id) AND s.status NOT IN ('draft', 'em_aberto') AND (s.payment_status IS NULL OR s.payment_status != 'pago')) +
      (SELECT COALESCE(SUM(so.total_amount), 0) FROM store_orders so WHERE (so.client_id = c.id OR so.parent_client_id = c.id) AND so.status NOT IN ('cancelado', 'em_aberto', 'aguardando_aprovacao_mae', 'recusado_matriz') AND (so.payment_status IS NULL OR so.payment_status != 'pago')) as open_balance,
      (SELECT COALESCE(SUM(s.final_freight_price), 0) FROM shipments s WHERE (s.client_id = c.id OR s.parent_client_id = c.id) AND s.status NOT IN ('draft', 'em_aberto') AND s.payment_status = 'pago') +
      (SELECT COALESCE(SUM(so.total_amount), 0) FROM store_orders so WHERE (so.client_id = c.id OR so.parent_client_id = c.id) AND so.status NOT IN ('cancelado', 'em_aberto', 'aguardando_aprovacao_mae', 'recusado_matriz') AND so.payment_status = 'pago') as paid_balance
    FROM clients c
    WHERE c.role = 'client'
    ORDER BY COALESCE(c.parent_client_id, c.id) DESC, c.parent_client_id ASC, c.created_at DESC
  `;

  db.all(query, [], (err, clients) => {
    if (err) {
      console.error('Erro ao listar clientes:', err);
      return res.status(500).json({ error: 'Erro ao buscar clientes no banco de dados.' });
    }
    res.json(clients);
  });
});

// GET /api/clients/network/billing-options - Listar CNPJs disponíveis na rede ("Faturar para")
router.get('/network/billing-options', (req, res) => {
  const currentClientId = req.clientId;
  const rootClientId = req.rootClientId || currentClientId;

  if (!rootClientId) {
    return res.json([]);
  }

  db.all(
    `SELECT id, name, branch_number, cnpj_cpf, city, state, parent_client_id 
     FROM clients 
     WHERE (id = ? OR parent_client_id = ?) AND status = 'active'
     ORDER BY CASE WHEN parent_client_id IS NULL THEN 0 ELSE 1 END, name ASC`,
    [rootClientId, rootClientId],
    (err, rows) => {
      if (err) {
        console.error('Erro ao listar opções de faturamento:', err);
        return res.status(500).json({ error: 'Erro ao buscar CNPJs da rede.' });
      }
      const options = (rows || []).map(r => ({
        id: r.id,
        name: r.name,
        branch_number: r.branch_number || null,
        cnpj: r.cnpj_cpf || '',
        cnpj_cpf: r.cnpj_cpf || '',
        city: r.city || '',
        state: r.state || '',
        is_mother: !r.parent_client_id,
        is_current: Number(r.id) === Number(currentClientId)
      }));
      res.json(options);
    }
  );
});

// GET /api/clients/branches/list - Listar sedes/usuários filhos da Conta Mãe logada (ou por parent_id no Admin)
router.get('/branches/list', (req, res) => {
  let parentId = null;
  if (req.isClient) {
    if (req.parentClientId) {
      return res.status(403).json({ error: 'Apenas a Conta Mãe pode gerenciar sedes.' });
    }
    parentId = req.clientId;
  } else {
    parentId = req.query.parent_id ? parseInt(req.query.parent_id, 10) : req.clientId;
  }

  if (!parentId) {
    return res.json([]);
  }

  db.all(
    `SELECT id, name, email, cnpj_cpf, cnpj_cpf AS cnpj, phone, status, created_at,
            parent_client_id, branch_number, can_access_flow, can_access_store,
            cep, address, address_number, complement, neighborhood, city, state
     FROM clients
     WHERE parent_client_id = ?
     ORDER BY created_at DESC`,
    [parentId],
    (err, branches) => {
      if (err) {
        console.error('Erro ao listar sedes filhas:', err);
        return res.status(500).json({ error: 'Erro ao buscar sedes cadastradas.' });
      }
      res.json(branches || []);
    }
  );
});

// POST /api/clients/branches - Cadastrar nova Sede / Usuário Filho
router.post('/branches', (req, res) => {
  let parentId = null;
  if (req.isClient) {
    if (req.parentClientId) {
      return res.status(403).json({ error: 'Apenas a Conta Mãe pode cadastrar novas sedes.' });
    }
    parentId = req.clientId;
  } else {
    parentId = req.body.parent_client_id ? parseInt(req.body.parent_client_id, 10) : req.clientId;
  }

  if (!parentId) {
    return res.status(400).json({ error: 'Conta Mãe não identificada para vincular a sede.' });
  }

  const {
    name,
    branch_number,
    email,
    password,
    cnpj_cpf,
    cnpj,
    phone,
    status,
    can_access_flow,
    can_access_store,
    cep,
    address,
    address_number,
    complement,
    neighborhood,
    city,
    state
  } = req.body;

  const resolvedCnpj = (cnpj_cpf || cnpj || '').trim();

  if (!name || !email || !password || !resolvedCnpj || !branch_number || !cep || !address || !city || !state) {
    return res.status(400).json({ error: 'Preencha todos os dados obrigatórios da sede (Nome, Nº da Sede, CNPJ, E-mail, Senha e Endereço completo).' });
  }

  if (String(password).trim().length < 6) {
    return res.status(400).json({ error: 'A senha de acesso deve ter pelo menos 6 caracteres.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const passwordHash = hashPassword(String(password).trim());
  const branchStatus = status === 'inactive' ? 'inactive' : 'active';
  const flowAccess = (can_access_flow === false || can_access_flow === 0 || can_access_flow === '0') ? 0 : 1;
  const storeAccess = (can_access_store === false || can_access_store === 0 || can_access_store === '0') ? 0 : 1;

  db.run(
    `INSERT INTO clients (
      name, email, password_hash, cnpj_cpf, phone, role, status,
      parent_client_id, branch_number, can_access_flow, can_access_store,
      cep, address, address_number, complement, neighborhood, city, state
    ) VALUES (?, ?, ?, ?, ?, 'client', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name.trim(),
      cleanEmail,
      passwordHash,
      resolvedCnpj,
      phone ? phone.trim() : null,
      branchStatus,
      parentId,
      String(branch_number).trim(),
      flowAccess,
      storeAccess,
      cep.replace(/\D/g, ''),
      address.trim(),
      address_number ? String(address_number).trim() : 'S/N',
      complement ? complement.trim() : '',
      neighborhood ? neighborhood.trim() : '',
      city.trim(),
      state.trim().toUpperCase()
    ],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail de login.' });
        }
        console.error('Erro ao cadastrar sede filha:', err);
        return res.status(500).json({ error: 'Erro ao salvar sede no banco de dados.' });
      }

      const newBranchId = this.lastID;

      // Criar endereço padrão na tabela addresses para a nova sede
      db.run(
        `INSERT INTO addresses (client_id, title, recipient_name, cep, address, number, complement, neighborhood, city, state, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          newBranchId,
          `Sede ${String(branch_number).trim()} - ${name.trim()}`,
          name.trim(),
          cep.replace(/\D/g, ''),
          address.trim(),
          address_number ? String(address_number).trim() : 'S/N',
          complement ? complement.trim() : '',
          neighborhood ? neighborhood.trim() : '',
          city.trim(),
          state.trim().toUpperCase()
        ],
        () => {}
      );

      res.status(201).json({
        success: true,
        message: 'Sede / Usuário Filho cadastrado com sucesso!',
        branch_id: newBranchId
      });
    }
  );
});

// PUT /api/clients/branches/:branchId - Atualizar Sede / Usuário Filho
router.put('/branches/:branchId', (req, res) => {
  const branchId = parseInt(req.params.branchId, 10);
  if (isNaN(branchId)) {
    return res.status(400).json({ error: 'ID da sede inválido.' });
  }

  db.get('SELECT * FROM clients WHERE id = ?', [branchId], (err, branch) => {
    if (err || !branch || !branch.parent_client_id) {
      return res.status(404).json({ error: 'Sede não encontrada.' });
    }

    if (req.isClient && Number(branch.parent_client_id) !== Number(req.clientId)) {
      return res.status(403).json({ error: 'Você não tem permissão para editar esta sede.' });
    }

    const {
      name,
      branch_number,
      email,
      password,
      cnpj_cpf,
      cnpj,
      phone,
      status,
      can_access_flow,
      can_access_store,
      cep,
      address,
      address_number,
      complement,
      neighborhood,
      city,
      state
    } = req.body;

    const incomingCnpj = cnpj_cpf !== undefined ? cnpj_cpf : cnpj;
    const finalName = name ? name.trim() : branch.name;
    const finalBranchNum = branch_number !== undefined ? String(branch_number).trim() : branch.branch_number;
    const finalEmail = email ? email.trim().toLowerCase() : branch.email;
    const finalCnpj = incomingCnpj !== undefined ? String(incomingCnpj).trim() : branch.cnpj_cpf;
    const finalPhone = phone !== undefined ? (phone ? phone.trim() : null) : branch.phone;
    const finalStatus = status || branch.status || 'active';
    const flowAccess = can_access_flow !== undefined ? ((can_access_flow === false || can_access_flow === 0 || can_access_flow === '0') ? 0 : 1) : branch.can_access_flow;
    const storeAccess = can_access_store !== undefined ? ((can_access_store === false || can_access_store === 0 || can_access_store === '0') ? 0 : 1) : branch.can_access_store;
    const finalCep = cep !== undefined ? cep.replace(/\D/g, '') : branch.cep;
    const finalAddress = address !== undefined ? address.trim() : branch.address;
    const finalNumber = address_number !== undefined ? String(address_number).trim() : branch.address_number;
    const finalComplement = complement !== undefined ? complement.trim() : branch.complement;
    const finalNeighborhood = neighborhood !== undefined ? neighborhood.trim() : branch.neighborhood;
    const finalCity = city !== undefined ? city.trim() : branch.city;
    const finalState = state !== undefined ? state.trim().toUpperCase() : branch.state;

    const syncDefaultAddress = () => {
      if (finalCep && finalAddress && finalCity && finalState) {
        db.get('SELECT id FROM addresses WHERE client_id = ? ORDER BY is_default DESC, id ASC LIMIT 1', [branchId], (aErr, addrRow) => {
          if (addrRow) {
            db.run(
              `UPDATE addresses SET title = ?, recipient_name = ?, cep = ?, address = ?, number = ?, complement = ?, neighborhood = ?, city = ?, state = ? WHERE id = ?`,
              [`Sede ${finalBranchNum || ''} - ${finalName}`.trim(), finalName, finalCep, finalAddress, finalNumber || 'S/N', finalComplement || '', finalNeighborhood || '', finalCity, finalState, addrRow.id]
            );
          } else {
            db.run(
              `INSERT INTO addresses (client_id, title, recipient_name, cep, address, number, complement, neighborhood, city, state, is_default)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
              [branchId, `Sede ${finalBranchNum || ''} - ${finalName}`.trim(), finalName, finalCep, finalAddress, finalNumber || 'S/N', finalComplement || '', finalNeighborhood || '', finalCity, finalState]
            );
          }
        });
      }
    };

    if (password && String(password).trim().length > 0) {
      if (String(password).trim().length < 6) {
        return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
      }
      const pHash = hashPassword(String(password).trim());
      db.run(
        `UPDATE clients SET
          name = ?, branch_number = ?, email = ?, password_hash = ?, cnpj_cpf = ?, phone = ?, status = ?,
          can_access_flow = ?, can_access_store = ?, cep = ?, address = ?, address_number = ?, complement = ?, neighborhood = ?, city = ?, state = ?
         WHERE id = ?`,
        [finalName, finalBranchNum, finalEmail, pHash, finalCnpj, finalPhone, finalStatus, flowAccess, storeAccess, finalCep, finalAddress, finalNumber, finalComplement, finalNeighborhood, finalCity, finalState, branchId],
        function (uErr) {
          if (uErr) {
            return res.status(500).json({ error: 'Erro ao atualizar dados da sede.' });
          }
          syncDefaultAddress();
          res.json({ success: true, message: 'Dados e senha da sede atualizados com sucesso!' });
        }
      );
    } else {
      db.run(
        `UPDATE clients SET
          name = ?, branch_number = ?, email = ?, cnpj_cpf = ?, phone = ?, status = ?,
          can_access_flow = ?, can_access_store = ?, cep = ?, address = ?, address_number = ?, complement = ?, neighborhood = ?, city = ?, state = ?
         WHERE id = ?`,
        [finalName, finalBranchNum, finalEmail, finalCnpj, finalPhone, finalStatus, flowAccess, storeAccess, finalCep, finalAddress, finalNumber, finalComplement, finalNeighborhood, finalCity, finalState, branchId],
        function (uErr) {
          if (uErr) {
            return res.status(500).json({ error: 'Erro ao atualizar dados da sede.' });
          }
          syncDefaultAddress();
          res.json({ success: true, message: 'Dados da sede atualizados com sucesso!' });
        }
      );
    }
  });
});

// DELETE /api/clients/branches/:branchId - Excluir Sede / Usuário Filho
router.delete('/branches/:branchId', (req, res) => {
  const branchId = parseInt(req.params.branchId, 10);
  if (isNaN(branchId)) {
    return res.status(400).json({ error: 'ID da sede inválido.' });
  }

  db.get('SELECT * FROM clients WHERE id = ?', [branchId], (err, branch) => {
    if (err || !branch || !branch.parent_client_id) {
      return res.status(404).json({ error: 'Sede não encontrada.' });
    }

    if (req.isClient && Number(branch.parent_client_id) !== Number(req.clientId)) {
      return res.status(403).json({ error: 'Você não tem permissão para remover esta sede.' });
    }

    db.run('DELETE FROM addresses WHERE client_id = ?', [branchId], () => {
      db.run('DELETE FROM clients WHERE id = ?', [branchId], (delErr) => {
        if (delErr) {
          return res.status(500).json({ error: 'Erro ao remover sede.' });
        }
        res.json({ success: true, message: 'Sede removida com sucesso.' });
      });
    });
  });
});

// GET /api/clients/:id - Detalhes completos de um cliente específico (Produtos, Carteira, Dados, Sedes)
router.get('/:id', (req, res) => {
  const clientId = req.params.id;

  if (req.isClient && parseInt(clientId, 10) !== req.clientId) {
    return res.status(403).json({ error: 'Acesso negado aos dados deste cliente.' });
  }

  db.get(
    `SELECT id, name, email, cnpj_cpf, phone, role, status, created_at,
            parent_client_id, branch_number, can_access_flow, can_access_store,
            cep, address, address_number, complement, neighborhood, city, state
     FROM clients WHERE id = ?`,
    [clientId],
    (err, client) => {
      if (err || !client) {
        return res.status(404).json({ error: 'Cliente não encontrado.' });
      }

      // Buscar produtos do cliente
      db.all(
        `SELECT id, code, name, description, image_url, stock_qty, unit_weight, unit_measure FROM products WHERE client_id = ? ORDER BY id DESC`,
        [clientId],
        (pErr, products) => {
          // Buscar remessas/carteira do cliente (incluindo das sedes filhas se for Conta Mãe)
          db.all(
            `SELECT s.id, s.code, s.type, s.recipient_name, s.dest_city, s.dest_state, s.final_freight_price, s.status, s.payment_status, s.nf_url, s.nf_number, s.boleto_url, s.billed_at, s.created_at,
                    s.client_id, s.parent_client_id, s.billing_client_id, s.billing_cnpj, s.billing_name,
                    c.name as requester_name, c.branch_number as requester_branch
             FROM shipments s
             LEFT JOIN clients c ON s.client_id = c.id
             WHERE s.client_id = ? OR s.parent_client_id = ? OR s.billing_client_id = ?
             ORDER BY s.id DESC`,
            [clientId, clientId, clientId],
            (sErr, shipments) => {
              // Buscar endereços do cliente
              db.all(
                `SELECT * FROM addresses WHERE client_id = ? ORDER BY is_default DESC`,
                [clientId],
                (aErr, addresses) => {
                  // Buscar sedes filhas vinculadas a este cliente
                  db.all(
                    `SELECT id, name, email, cnpj_cpf, phone, status, created_at, branch_number, can_access_flow, can_access_store, cep, address, address_number, complement, neighborhood, city, state
                     FROM clients WHERE parent_client_id = ? ORDER BY id DESC`,
                    [clientId],
                    (bErr, branches) => {
                      const approvedShipments = (shipments || []).filter(s => s.status !== 'draft' && s.status !== 'em_aberto');
                      const openBalance = approvedShipments
                        .filter(s => s.payment_status !== 'pago')
                        .reduce((acc, s) => acc + (s.final_freight_price || 0), 0);

                      const paidBalance = approvedShipments
                        .filter(s => s.payment_status === 'pago')
                        .reduce((acc, s) => acc + (s.final_freight_price || 0), 0);

                      res.json({
                        client,
                        stats: {
                          total_products: (products || []).length,
                          total_shipments: (shipments || []).length,
                          total_branches: (branches || []).length,
                          open_balance: openBalance,
                          paid_balance: paidBalance
                        },
                        products: products || [],
                        shipments: shipments || [],
                        addresses: addresses || [],
                        branches: branches || []
                      });
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});

// POST /api/clients - Criar novo cliente
router.post('/', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }

  const { name, email, password, cnpj_cpf, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios para cadastrar um cliente.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const passwordHash = hashPassword(password);

  db.run(
    `INSERT INTO clients (name, email, password_hash, cnpj_cpf, phone, role, status) VALUES (?, ?, ?, ?, ?, 'client', 'active')`,
    [name.trim(), cleanEmail, passwordHash, cnpj_cpf || null, phone || null],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Já existe um cliente cadastrado com este e-mail.' });
        }
        console.error('Erro ao cadastrar cliente:', err);
        return res.status(500).json({ error: 'Erro ao salvar novo cliente no banco de dados.' });
      }

      res.status(201).json({
        success: true,
        client: {
          id: this.lastID,
          name: name.trim(),
          email: cleanEmail,
          cnpj_cpf,
          phone,
          role: 'client',
          status: 'active'
        }
      });
    }
  );
});

// PUT /api/clients/:id - Atualizar cliente
router.put('/:id', (req, res) => {
  const clientId = parseInt(req.params.id, 10);

  if (req.isClient && clientId !== req.clientId) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  const { name, email, password, cnpj_cpf, cnpj, doc, phone, status } = req.body;
  const finalDoc = cnpj_cpf !== undefined ? cnpj_cpf : (cnpj !== undefined ? cnpj : (doc !== undefined ? doc : null));
  const finalPhone = phone ? phone.trim() : null;
  const finalName = name ? name.trim() : '';
  const finalEmail = email ? email.trim().toLowerCase() : '';

  if (password && password.trim().length > 0) {
    const cleanPass = password.trim();
    if (cleanPass.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve possuir no mínimo 6 caracteres.' });
    }
    const passwordHash = hashPassword(cleanPass);
    db.run(
      `UPDATE clients SET name = ?, email = ?, password_hash = ?, cnpj_cpf = ?, phone = ?, status = ? WHERE id = ?`,
      [finalName, finalEmail, passwordHash, finalDoc, finalPhone, status || 'active', clientId],
      function (err) {
        if (err) {
          console.error('Erro ao atualizar cliente com senha:', err);
          return res.status(500).json({ error: 'Erro ao atualizar dados do cliente.' });
        }
        res.json({ success: true, message: 'Dados e senha do cliente atualizados com sucesso.' });
      }
    );
  } else {
    db.run(
      `UPDATE clients SET name = ?, email = ?, cnpj_cpf = ?, phone = ?, status = ? WHERE id = ?`,
      [finalName, finalEmail, finalDoc, finalPhone, status || 'active', clientId],
      function (err) {
        if (err) {
          console.error('Erro ao atualizar cliente:', err);
          return res.status(500).json({ error: 'Erro ao atualizar dados do cliente.' });
        }
        res.json({ success: true, message: 'Dados do cliente atualizados com sucesso.' });
      }
    );
  }
});

// DELETE /api/clients/:id - Excluir cliente e seus dados (com exclusão em cascata de produtos, remessas e regras)
router.delete('/:id', (req, res) => {
  if (req.isClient) {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }

  const clientId = parseInt(req.params.id, 10);
  if (isNaN(clientId)) {
    return res.status(400).json({ error: 'ID de cliente inválido.' });
  }

  // Verificar se o cliente existe e se não é um administrador
  db.get('SELECT id, name, role FROM clients WHERE id = ?', [clientId], (getErr, client) => {
    if (getErr) {
      console.error('Erro ao consultar cliente para exclusão:', getErr);
      return res.status(500).json({ error: 'Erro ao consultar cliente no banco de dados.' });
    }
    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    if (client.role === 'admin') {
      return res.status(400).json({ error: 'Não é permitido excluir uma conta de administrador.' });
    }

    // Buscar imagens de produtos vinculados a este cliente para remover do disco
    db.all('SELECT image_url FROM products WHERE client_id = ?', [clientId], (imgErr, prods) => {
      const imagesToDelete = (prods || [])
        .map(p => p.image_url)
        .filter(url => url && url.startsWith('/uploads/'));

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // 1. Remover itens do carrinho vinculados ao cliente ou aos produtos dele
        db.run(
          'DELETE FROM cart_items WHERE client_id = ? OR product_id IN (SELECT id FROM products WHERE client_id = ?)',
          [clientId, clientId]
        );

        // 2. Remover pacotes/volumes de remessas do cliente
        db.run(
          'DELETE FROM shipment_packages WHERE shipment_id IN (SELECT id FROM shipments WHERE client_id = ?)',
          [clientId]
        );

        // 3. Remover itens de remessas do cliente ou que apontem para produtos deste cliente
        db.run(
          'DELETE FROM shipment_items WHERE shipment_id IN (SELECT id FROM shipments WHERE client_id = ?) OR product_id IN (SELECT id FROM products WHERE client_id = ?)',
          [clientId, clientId]
        );

        // 4. Remover remessas do cliente
        db.run(
          'DELETE FROM shipments WHERE client_id = ?',
          [clientId]
        );

        // 5. Remover faturas / fechamentos do cliente
        db.run(
          'DELETE FROM billing_invoices WHERE client_id = ?',
          [clientId]
        );

        // 6. Remover endereços cadastrados do cliente
        db.run(
          'DELETE FROM addresses WHERE client_id = ?',
          [clientId]
        );

        // 7. Remover regras de embalagem dos produtos do cliente
        db.run(
          'DELETE FROM packaging_rules WHERE product_id IN (SELECT id FROM products WHERE client_id = ?)',
          [clientId]
        );

        // 8. Remover todos os produtos vinculados a este cliente
        db.run(
          'DELETE FROM products WHERE client_id = ?',
          [clientId]
        );

        // 9. Remover o próprio cadastro do cliente
        db.run(
          'DELETE FROM clients WHERE id = ? AND role != "admin"',
          [clientId],
          function (delErr) {
            if (delErr) {
              db.run('ROLLBACK');
              console.error('Erro ao excluir cliente:', delErr);
              return res.status(500).json({ error: 'Erro ao excluir cliente do banco de dados.' });
            }

            db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                console.error('Erro ao efetivar exclusão:', commitErr);
                return res.status(500).json({ error: 'Erro ao efetivar transação de exclusão.' });
              }

              // Limpar fotos locais de produtos excluídos
              imagesToDelete.forEach(imgUrl => {
                try {
                  const filename = path.basename(imgUrl);
                  const fullPath = path.join(__dirname, '../../uploads', filename);
                  if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                  }
                } catch (e) {
                  console.warn('Não foi possível remover imagem do produto:', imgUrl, e.message);
                }
              });

              res.json({
                success: true,
                message: `Cliente "${client.name}" e todos os seus produtos e dados vinculados foram excluídos com sucesso.`
              });
            });
          }
        );
      });
    });
  });
});

module.exports = router;
