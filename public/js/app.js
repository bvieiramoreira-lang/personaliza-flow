/**
 * Personaliza Flow - ERP Logístico (Vanilla JS)
 * Frontend Application Logic
 */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

let currentAuthUser = null;
try {
  const userJson = localStorage.getItem('authUser');
  if (userJson) {
    currentAuthUser = JSON.parse(userJson);
  }
} catch (e) {
  console.error('Erro ao ler authUser:', e);
}

// Proteção de Rota: Redirecionar para login.html se não houver usuário autenticado
if (!currentAuthUser && !window.location.pathname.includes('login.html')) {
  window.location.href = '/login.html';
}

let currentRole = currentAuthUser ? currentAuthUser.role : (localStorage.getItem('appRole') || 'admin');

// ==========================================================================
// INTERCEPTOR GLOBAL DE FETCH (AUTENTICAÇÃO & MULTI-TENANT)
// ==========================================================================
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    try {
      const token = localStorage.getItem('authToken');
      const userStr = localStorage.getItem('authUser');
      let user = currentAuthUser;
      if (!user && userStr) {
        try { user = JSON.parse(userStr); } catch (e) {}
      }

      const isApiCall = typeof url === 'string' && (url.startsWith('/api') || url.includes('/api/'));
      if (isApiCall) {
        const opts = options || {};
        let headers = opts.headers || {};

        if (typeof Headers !== 'undefined' && headers instanceof Headers) {
          if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
          }
          if (user && user.id && !headers.has('x-user-id')) {
            headers.set('x-user-id', String(user.id));
          }
          if (user && user.role === 'client' && !headers.has('x-target-client-id')) {
            headers.set('x-target-client-id', String(user.id));
          }
        } else if (Array.isArray(headers)) {
          if (token && !headers.some(h => h[0].toLowerCase() === 'authorization')) {
            headers.push(['Authorization', `Bearer ${token}`]);
          }
          if (user && user.id && !headers.some(h => h[0].toLowerCase() === 'x-user-id')) {
            headers.push(['x-user-id', String(user.id)]);
          }
          if (user && user.role === 'client' && !headers.some(h => h[0].toLowerCase() === 'x-target-client-id')) {
            headers.push(['x-target-client-id', String(user.id)]);
          }
        } else {
          headers = { ...headers };
          if (token && !headers['Authorization'] && !headers['authorization']) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          if (user && user.id && !headers['x-user-id']) {
            headers['x-user-id'] = String(user.id);
          }
          if (user && user.role === 'client' && !headers['x-target-client-id']) {
            headers['x-target-client-id'] = String(user.id);
          }
        }

        opts.headers = headers;
        return originalFetch.call(this, url, opts);
      }
    } catch (e) {
      console.error('Erro no interceptor de fetch:', e);
    }
    return originalFetch.call(this, url, options);
  };
})();

function initApp() {
  if (!currentAuthUser) return;
  
  initSidebarPin();
  renderUserTopBar();
  if (typeof setAppRole === 'function') setAppRole(currentRole);
  if (typeof initNavigation === 'function') initNavigation();
  if (typeof initGreeting === 'function') initGreeting();
  if (typeof loadProducts === 'function') loadProducts();
  if (typeof loadCart === 'function') loadCart();
  if (typeof loadShipments === 'function') loadShipments();
  if (typeof loadAddresses === 'function') loadAddresses();
  if (typeof loadSettings === 'function') loadSettings();
  if (typeof initFormEvents === 'function') initFormEvents();
  if (currentRole === 'admin' && typeof loadClients === 'function') loadClients();
}

function getInitials(name) {
  if (!name) return 'PF';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function updateAvatarInitials() {
  const name = currentAuthUser ? currentAuthUser.name : 'Personaliza Flow';
  const initials = getInitials(name);
  const avatarUrl = currentAuthUser && currentAuthUser.avatar_url ? currentAuthUser.avatar_url : null;

  // 1. Avatar de Minha Conta na Página
  const myAccountAvatar = document.getElementById('my-account-avatar-circle');
  if (myAccountAvatar) {
    if (avatarUrl) {
      myAccountAvatar.innerHTML = `<img src="${avatarUrl}" alt="${escapeHtml(name)}">`;
      myAccountAvatar.style.background = '#e2e8f0';
    } else {
      myAccountAvatar.innerHTML = escapeHtml(initials);
      myAccountAvatar.style.background = 'linear-gradient(135deg, #1d4ed8, #3b82f6)';
    }
  }

  // 2. Avatar da Barra Lateral Inferior (Atalho Minha Conta)
  const stripAvatar = document.getElementById('strip-user-avatar');
  if (stripAvatar) {
    if (avatarUrl) {
      stripAvatar.innerHTML = `<img src="${avatarUrl}" alt="${escapeHtml(name)}">`;
      stripAvatar.style.background = '#e2e8f0';
    } else {
      stripAvatar.innerHTML = escapeHtml(initials);
      stripAvatar.style.background = 'linear-gradient(135deg, #1d4ed8, #2563eb)';
    }
  }

  // 3. Botão de remover foto na tela de Minha Conta
  const btnRemove = document.getElementById('btn-remove-avatar');
  if (btnRemove) {
    if (avatarUrl) {
      btnRemove.classList.remove('hidden');
    } else {
      btnRemove.classList.add('hidden');
    }
  }
}

function renderUserTopBar() {
  const roleSelector = document.querySelector('.role-selector');
  if (roleSelector && currentAuthUser) {
    let userBadge = document.getElementById('user-profile-badge');
    if (!userBadge) {
      userBadge = document.createElement('div');
      userBadge.id = 'user-profile-badge';
      userBadge.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; background: #ffffff; padding: 0.35rem 0.85rem; border-radius: 20px; border: 1px solid var(--border-color); font-size: 0.83rem; margin-left: 0.75rem; box-shadow: var(--shadow-sm);';
      roleSelector.parentNode.appendChild(userBadge);
    }
    userBadge.innerHTML = `
      <span style="font-weight: 600; color: var(--text-primary); cursor: pointer;" onclick="switchTab('tab-my-account')" title="Clique para abrir Minha Conta">${escapeHtml(currentAuthUser.name)}</span>
    `;

    // Se for cliente comum (não admin), oculta a chave seletora de perfil
    if (currentAuthUser.role === 'client') {
      roleSelector.style.display = 'none';
    }
  }
  updateAvatarInitials();
}

function handleLogout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('authUser');
  localStorage.removeItem('appRole');
  window.location.href = '/login.html';
}

/* ==========================================================================
   GESTÃO DO MENU LATERAL (FIXAR / DESAFIXAR & FLYOUT HOVER)
   ========================================================================== */
function initSidebarPin() {
  const savedPin = localStorage.getItem('pf_sidebar_pinned');
  // Padrão: fixado (true) caso o usuário nunca tenha alterado
  const isPinned = savedPin !== 'false';
  const chkPin = document.getElementById('chk-pin-menu');
  if (chkPin) {
    chkPin.checked = isPinned;
  }
  applySidebarPinState(isPinned);
  setupSidebarHover();
}

function toggleSidebarPin(isPinned) {
  localStorage.setItem('pf_sidebar_pinned', isPinned ? 'true' : 'false');
  applySidebarPinState(isPinned);
}
window.toggleSidebarPin = toggleSidebarPin;

function applySidebarPinState(isPinned) {
  const wrapper = document.getElementById('sidebar-wrapper');
  if (!wrapper) return;
  if (isPinned) {
    wrapper.classList.remove('unpinned');
    wrapper.classList.remove('hover-open');
  } else {
    wrapper.classList.add('unpinned');
    wrapper.classList.remove('hover-open');
  }
}

function setupSidebarHover() {
  const wrapper = document.getElementById('sidebar-wrapper');
  if (!wrapper) return;

  let closeTimer = null;

  wrapper.addEventListener('mouseenter', () => {
    if (wrapper.classList.contains('unpinned')) {
      if (closeTimer) clearTimeout(closeTimer);
      wrapper.classList.add('hover-open');
    }
  });

  wrapper.addEventListener('mouseleave', () => {
    if (wrapper.classList.contains('unpinned')) {
      closeTimer = setTimeout(() => {
        wrapper.classList.remove('hover-open');
      }, 150);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

/* ==========================================================================
   1. NAVEGAÇÃO ENTRE ABAS & GESTÃO DE PERFIS (CLIENTE VS ADMIN)
   ========================================================================== */

function initGreeting() {
  const greetingEl = document.getElementById('welcome-greeting-text');
  if (!greetingEl) return;

  const currentHour = new Date().getHours();
  let greetingText = 'Boa tarde';

  if (currentHour < 12) {
    greetingText = 'Bom dia';
  } else if (currentHour >= 18) {
    greetingText = 'Boa noite';
  }

  const userName = currentAuthUser ? currentAuthUser.name : 'Personaliza Brindes';
  greetingEl.textContent = `${greetingText}, ${userName}`;
}

function setAppRole(role) {
  // Se usuário autenticado for cliente, ele nunca pode virar admin
  if (currentAuthUser && currentAuthUser.role === 'client') {
    role = 'client';
  }

  currentRole = role;
  localStorage.setItem('appRole', role);
  const btnClient = document.getElementById('btn-role-client');
  const btnAdmin = document.getElementById('btn-role-admin');
  const adminElements = document.querySelectorAll('.admin-only');
  const clientElements = document.querySelectorAll('.client-only');

  if (role === 'admin') {
    if (btnAdmin) btnAdmin.classList.add('active');
    if (btnClient) btnClient.classList.remove('active');
    adminElements.forEach(el => {
      if (!el.classList.contains('tab-page')) {
        el.classList.remove('hidden');
      }
    });
    clientElements.forEach(el => el.classList.add('hidden'));
  } else {
    if (btnClient) btnClient.classList.add('active');
    if (btnAdmin) btnAdmin.classList.remove('active');
    adminElements.forEach(el => el.classList.add('hidden'));
    clientElements.forEach(el => {
      if (!el.classList.contains('tab-page')) {
        el.classList.remove('hidden');
      }
    });

    // Se estiver em uma aba exclusiva de admin ao trocar para cliente, vai para a home
    const activePage = document.querySelector('.tab-page:not(.hidden)');
    if (activePage && (activePage.id === 'tab-products' || activePage.id === 'tab-settings' || activePage.id === 'tab-clients' || activePage.id === 'page-client-detail' || activePage.id === 'page-add-client' || activePage.id === 'page-product-form')) {
      switchTab('tab-home');
    }
  }

  // Recarregar/filtrar remessas para mostrar/esconder botões e filtros de admin
  if (typeof filterShipments === 'function') {
    filterShipments();
  } else if (typeof renderShipmentCards === 'function' && window.allDetailedShipments) {
    renderShipmentCards(window.allDetailedShipments);
  }
}

function switchTab(targetTab) {
  const stripItems = document.querySelectorAll('.strip-item[data-tab]');
  const panelItems = document.querySelectorAll('.panel-item[data-tab]');
  const tabPages = document.querySelectorAll('.tab-page');

  let activeNavTab = targetTab;
  if (targetTab === 'page-client-detail' || targetTab === 'page-add-client') activeNavTab = 'tab-clients';
  if (targetTab === 'page-product-form') activeNavTab = (typeof productFormReturnTab !== 'undefined' && productFormReturnTab === 'page-client-detail') ? 'tab-clients' : 'tab-products';

  stripItems.forEach(s => s.classList.toggle('active', s.getAttribute('data-tab') === activeNavTab));
  panelItems.forEach(p => p.classList.toggle('active', p.getAttribute('data-tab') === activeNavTab));

  tabPages.forEach(page => {
    if (page.id === targetTab) {
      page.classList.remove('hidden');
    } else {
      page.classList.add('hidden');
    }
  });

  const greetingContainer = document.getElementById('welcome-greeting-container');
  if (greetingContainer) {
    if (targetTab === 'tab-home') {
      greetingContainer.classList.remove('hidden');
    } else {
      greetingContainer.classList.add('hidden');
    }
  }

  if (targetTab === 'tab-cart') {
    loadCart();
  }
  if (targetTab === 'tab-addresses') {
    loadAddresses();
  }
  if (targetTab === 'tab-billing') {
    loadBillingData();
  }
  if (targetTab === 'tab-products' || targetTab === 'tab-my-products') {
    loadProducts();
  }
  if (targetTab === 'tab-clients') {
    loadClients();
  }
  if (targetTab === 'tab-my-account') {
    loadMyAccountData();
  }

  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.scrollTop = 0;
  }
}

function initNavigation() {
  const stripItems = document.querySelectorAll('.strip-item[data-tab]');
  const panelItems = document.querySelectorAll('.panel-item[data-tab]');

  stripItems.forEach(item => {
    item.addEventListener('click', () => switchTab(item.getAttribute('data-tab')));
  });

  panelItems.forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.getAttribute('data-tab'));
      // Se o menu estiver no modo flutuante (desafixado), fecha após o clique
      const wrapper = document.getElementById('sidebar-wrapper');
      if (wrapper && wrapper.classList.contains('unpinned')) {
        wrapper.classList.remove('hover-open');
      }
    });
  });
}

/* ==========================================================================
   MINHA CONTA - CARREGAMENTO & ATUALIZAÇÃO DE PERFIL
   ========================================================================== */
async function loadMyAccountData() {
  if (!currentAuthUser) return;
  
  // Preencher inicialmente com os dados já disponíveis
  fillMyAccountForm(currentAuthUser);

  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        currentAuthUser = { ...currentAuthUser, ...data.user };
        localStorage.setItem('authUser', JSON.stringify(currentAuthUser));
        fillMyAccountForm(currentAuthUser);
        updateAvatarInitials();
      }
    }
  } catch (err) {
    console.error('Erro ao buscar perfil atualizado:', err);
  }
}
window.loadMyAccountData = loadMyAccountData;

function fillMyAccountForm(user) {
  const inputName = document.getElementById('my-account-name');
  const inputEmail = document.getElementById('my-account-email');
  const inputDoc = document.getElementById('my-account-doc');
  const inputPhone = document.getElementById('my-account-phone');
  const cardName = document.getElementById('my-account-card-name');
  const cardEmail = document.getElementById('my-account-card-email');
  const cardRole = document.getElementById('my-account-card-role');

  if (inputName) inputName.value = user.name || '';
  if (inputEmail) inputEmail.value = user.email || '';
  if (inputDoc) inputDoc.value = user.cnpj_cpf || '';
  if (inputPhone) inputPhone.value = user.phone || '';

  if (cardName) cardName.textContent = user.name || 'Usuário';
  if (cardEmail) cardEmail.textContent = user.email || '-';
  if (cardRole) {
    cardRole.textContent = user.role === 'admin' ? 'Administrador' : 'Cliente';
  }
}

async function handleSaveMyAccount(event) {
  if (event) event.preventDefault();
  const feedbackEl = document.getElementById('my-account-feedback');
  const btnSave = document.getElementById('btn-save-my-account');

  const name = document.getElementById('my-account-name').value.trim();
  const doc = document.getElementById('my-account-doc').value.trim();
  const phone = document.getElementById('my-account-phone').value.trim();
  const password = document.getElementById('my-account-password').value;
  const confirmPassword = document.getElementById('my-account-confirm-password').value;

  if (!name) {
    showMyAccountFeedback('Por favor, informe seu nome completo ou da empresa.', 'error');
    showToast('Por favor, informe seu nome completo ou da empresa.', 'error');
    return;
  }

  const isChangingPassword = Boolean(password || confirmPassword);

  if (isChangingPassword) {
    if (!password) {
      showMyAccountFeedback('Por favor, digite a nova senha desejada.', 'error');
      showToast('Por favor, digite a nova senha desejada.', 'error');
      return;
    }
    if (password.length < 6) {
      showMyAccountFeedback('A nova senha deve possuir no mínimo 6 caracteres.', 'error');
      showToast('A nova senha deve possuir no mínimo 6 caracteres.', 'error');
      return;
    }
    if (!confirmPassword) {
      showMyAccountFeedback('Por favor, preencha a confirmação da nova senha.', 'error');
      showToast('Por favor, preencha a confirmação da nova senha.', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showMyAccountFeedback('As senhas digitadas não coincidem. Verifique e tente novamente.', 'error');
      showToast('As senhas digitadas não coincidem.', 'error');
      return;
    }
  }

  try {
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = 'Salvando...';
    }

    const payload = {
      name,
      cnpj_cpf: doc,
      phone,
      password: isChangingPassword ? password.trim() : undefined
    };

    const res = await fetch('/api/auth/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Erro ao salvar alterações.');
    }

    if (data.user) {
      currentAuthUser = { ...currentAuthUser, ...data.user };
      localStorage.setItem('authUser', JSON.stringify(currentAuthUser));
      fillMyAccountForm(currentAuthUser);
      updateAvatarInitials();
      initGreeting();
      renderUserTopBar();
    }

    // Limpa campos de senha por segurança
    const passInput = document.getElementById('my-account-password');
    const confirmPassInput = document.getElementById('my-account-confirm-password');
    if (passInput) passInput.value = '';
    if (confirmPassInput) confirmPassInput.value = '';

    const msg = isChangingPassword 
      ? 'Dados cadastrais e nova senha atualizados com sucesso!' 
      : 'Dados cadastrais atualizados com sucesso!';

    showMyAccountFeedback(msg, 'success');
    showToast(msg, 'success');
  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    showMyAccountFeedback(err.message || 'Erro de conexão com o servidor.', 'error');
    showToast(err.message || 'Erro de conexão com o servidor.', 'error');
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.textContent = 'Salvar Alterações';
    }
  }
}
window.handleSaveMyAccount = handleSaveMyAccount;

function showMyAccountFeedback(msg, type) {
  const feedbackEl = document.getElementById('my-account-feedback');
  if (!feedbackEl) return;
  feedbackEl.textContent = msg;
  feedbackEl.className = type === 'success' ? 'feedback-success' : 'feedback-error';
  feedbackEl.classList.remove('hidden');

  setTimeout(() => {
    feedbackEl.classList.add('hidden');
  }, 5000);
}

/* --------------------------------------------------------------------------
   GESTÃO DE UPLOAD & REMOÇÃO DE FOTO DE PERFIL (AVATAR)
   -------------------------------------------------------------------------- */
async function handleAvatarFileSelect(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];

  if (!file.type.startsWith('image/')) {
    showMyAccountFeedback('Por favor, selecione um arquivo de imagem válido (PNG, JPG, JPEG, WEBP).', 'error');
    input.value = '';
    return;
  }

  // Limite de 5MB
  if (file.size > 5 * 1024 * 1024) {
    showMyAccountFeedback('A foto deve possuir tamanho máximo de 5MB.', 'error');
    input.value = '';
    return;
  }

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    showMyAccountFeedback('Enviando foto de perfil...', 'success');

    const res = await fetch('/api/auth/avatar', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Falha ao realizar upload da foto de perfil.');
    }

    if (data.avatarUrl) {
      currentAuthUser.avatar_url = data.avatarUrl;
      localStorage.setItem('authUser', JSON.stringify(currentAuthUser));
      updateAvatarInitials();
      showMyAccountFeedback('Foto de perfil atualizada com sucesso!', 'success');
    }
  } catch (err) {
    console.error('Erro no upload de foto de perfil:', err);
    showMyAccountFeedback(err.message || 'Erro ao enviar foto para o servidor.', 'error');
  } finally {
    input.value = '';
  }
}
window.handleAvatarFileSelect = handleAvatarFileSelect;

async function handleRemoveAvatar() {
  if (!confirm('Deseja remover sua foto de perfil?')) return;

  try {
    const res = await fetch('/api/auth/avatar', {
      method: 'DELETE'
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao remover foto de perfil.');
    }

    currentAuthUser.avatar_url = null;
    localStorage.setItem('authUser', JSON.stringify(currentAuthUser));
    updateAvatarInitials();
    showMyAccountFeedback('Foto de perfil removida com sucesso.', 'success');
  } catch (err) {
    console.error('Erro ao remover avatar:', err);
    showMyAccountFeedback(err.message || 'Erro de conexão com o servidor.', 'error');
  }
}
window.handleRemoveAvatar = handleRemoveAvatar;



/* ==========================================================================
   2. GESTÃO DE PRODUTOS
   ========================================================================== */
let cachedProducts = [];

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    cachedProducts = await res.json();

    renderProductsSelect(cachedProducts);
    renderProductsTable(cachedProducts);
    renderMyProductsCatalog(cachedProducts);
  } catch (err) {
    console.error('Erro ao carregar produtos:', err);
  }
}

async function uploadProductImage(inputElement) {
  if (!inputElement.files || !inputElement.files[0]) return;
  const file = inputElement.files[0];
  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch('/api/products/upload', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      throw new Error('Falha no upload da imagem.');
    }
    const data = await res.json();
    document.getElementById('prod-image-url').value = data.imageUrl;

    const previewContainer = document.getElementById('prod-image-preview-container');
    const previewImg = document.getElementById('prod-image-preview-img');
    if (previewContainer && previewImg) {
      previewImg.src = data.imageUrl;
      previewContainer.style.display = 'flex';
    }
    showToast('Imagem enviada com sucesso!');
  } catch (err) {
    alert('Erro ao enviar imagem: ' + err.message);
  }
}

function renderProductsSelect(products) {
  const selects = document.querySelectorAll('.product-select-dropdown');
  selects.forEach(select => {
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Selecione um produto --</option>' +
      (products || []).map(p => `<option value="${p.id}">${p.code} - ${p.name} (Estoque: ${p.stock_qty || 0})</option>`).join('');
    if (currentVal) select.value = currentVal;
  });
}

function renderProductsTable(products) {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;

  if (!products || products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum produto cadastrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(p => `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 0.75rem 1rem; font-weight: 700; font-family: monospace;">${p.code || '-'}</td>
      <td style="padding: 0.75rem 1rem; color: #64748b;">${p.order_number || '-'}</td>
      <td style="padding: 0.75rem 1rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <img src="${p.image_url || '/images/garrafa.png'}" onerror="this.src='/images/garrafa.png'" style="width: 36px; height: 36px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0;">
          <div>
            <div style="font-weight: 600; color: #1e293b;">${p.name || ''}</div>
            <div style="font-size: 0.78rem; color: #64748b;">${p.description || ''}</div>
          </div>
        </div>
      </td>
      <td style="padding: 0.75rem 1rem;">${p.unit_weight || 0} kg</td>
      <td style="padding: 0.75rem 1rem; font-size: 0.8rem; color: #64748b;">${p.unit_length || 0}x${p.unit_width || 0}x${p.unit_height || 0} cm</td>
      <td style="padding: 0.75rem 1rem; font-weight: 600;">${p.max_qty_per_box || 1} un</td>
      <td style="padding: 0.75rem 1rem; font-size: 0.8rem; color: #64748b;">${p.box_length || 0}x${p.box_width || 0}x${p.box_height || 0} cm</td>
      <td style="padding: 0.75rem 1rem;">${p.box_weight || 0} kg</td>
      <td style="padding: 0.75rem 1rem; text-align: center;">
        <div style="display: flex; gap: 0.35rem; justify-content: center;">
          <button class="btn btn-secondary btn-sm" onclick="editProduct(${p.id})" title="Editar Produto" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})" title="Excluir Produto" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background: #ef4444; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function deleteProduct(productId) {
  if (!confirm('Tem certeza que deseja excluir este produto? Esta ação removerá também as regras de embalagem associadas.')) return;

  try {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    if (!res.ok) {
      showToast('Erro ao excluir produto: ' + (data.error || 'Falha na requisição'), 'error');
      return;
    }

    showToast('Produto excluído com sucesso!', 'success');
    await loadProducts();
  } catch (err) {
    showToast('Erro de conexão ao excluir produto.', 'error');
  }
}

function renderMyProductsCatalog(products) {
  const container = document.getElementById('my-products-grid-container');
  if (!container) return;

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: #ffffff; border-radius: 16px; border: 1px solid var(--border-color);">
        <p style="font-size: 1.1rem; color: var(--text-muted);">Nenhum produto encontrado no estoque.</p>
      </div>
    `;
    return;
  }

  // Mapear quantidades que já foram adicionadas ao carrinho para abater do estoque disponível
  const cartItemsMap = {};
  if (currentCart && currentCart.items) {
    currentCart.items.forEach(item => {
      cartItemsMap[item.product_id] = (cartItemsMap[item.product_id] || 0) + item.quantity;
    });
  }

  container.innerHTML = products.map(p => {
    const imgSrc = p.image_url || '/images/garrafa.png';
    const totalStock = p.stock_qty !== undefined && p.stock_qty !== null ? p.stock_qty : 100;
    const inCartQty = cartItemsMap[p.id] || 0;
    const availableStock = Math.max(0, totalStock - inCartQty);

    const unitWeight = parseFloat(p.unit_weight !== undefined ? p.unit_weight : p.unit_weight_kg || 0);
    const unitLength = p.unit_length !== undefined ? p.unit_length : p.unit_length_cm || 0;
    const unitWidth = p.unit_width !== undefined ? p.unit_width : p.unit_width_cm || 0;
    const unitHeight = p.unit_height !== undefined ? p.unit_height : p.unit_height_cm || 0;
    const safeName = p.name.replace(/'/g, "\\'");

    const isOutOfStock = availableStock <= 0;
    const stockBadgeHTML = isOutOfStock
      ? `<span class="product-card-stock-qty" style="color: #ef4444; font-weight: 800;">Esgotado (${inCartQty > 0 ? inCartQty + ' un no carrinho' : '0 un'})</span>`
      : `<span class="product-card-stock-qty" style="color: #16a34a; font-weight: 700;">${availableStock} un</span>`;

    const orderBadgeHTML = p.order_number 
      ? `<span style="font-size: 0.73rem; background: #e0f2fe; color: #0369a1; font-weight: 700; padding: 2px 8px; border-radius: 4px;">Pedido: ${p.order_number}</span>`
      : '';

    return `
      <div class="product-catalog-card">
        <div class="product-card-img-wrapper" onclick="openImagePreview('${imgSrc}', '${safeName}')" title="Clique para expandir a imagem">
          <div style="position: absolute; top: 10px; left: 10px; display: flex; gap: 0.4rem; flex-wrap: wrap; z-index: 2;">
            <span class="product-card-badge" style="position: relative; top: 0; left: 0;">${p.code}</span>
            ${orderBadgeHTML}
          </div>
          <img src="${imgSrc}" alt="${p.name}" class="product-card-img" onerror="this.src='/images/garrafa.png'">
        </div>
        <div class="product-card-body">
          <h3 class="product-card-title">${p.name}</h3>
          <p class="product-card-desc">${p.description || 'Produto personalizado em estoque no centro de distribuição.'}</p>
          
          <div class="product-card-stock">
            <span style="color: var(--text-muted);">Estoque Disponível:</span>
            ${stockBadgeHTML}
          </div>

          <div class="product-card-specs">
            <span>Peso Unit.: <strong>${unitWeight.toFixed(3)} kg</strong></span>
            <span>Dimensões: <strong>${unitLength}x${unitWidth}x${unitHeight} cm</strong></span>
            <span>Caixa Padrão: <strong>máx ${p.max_qty_per_box || 1} un/caixa</strong></span>
          </div>

          <div class="product-card-footer" style="display: flex; gap: 0.4rem; width: 100%; margin-top: auto; padding-top: 0.75rem; align-items: flex-end;">
            <div style="display: flex; flex-direction: column; gap: 0.2rem; width: 68px; flex-shrink: 0;">
              <span style="font-size: 0.68rem; color: var(--text-muted); font-weight: 700;">QTD:</span>
              <input type="number" id="catalog-qty-${p.id}" value="${isOutOfStock ? 0 : 1}" min="1" max="${availableStock}" ${isOutOfStock ? 'disabled' : ''} style="width: 100%; padding: 0.45rem 0.2rem; border: 1px solid var(--border-color); border-radius: 8px; font-weight: 700; text-align: center; font-size: 0.9rem;">
            </div>
            <button class="btn btn-primary" ${isOutOfStock ? 'disabled' : ''} style="flex: 1; padding: 0.5rem 0.35rem; white-space: nowrap; font-size: 0.78rem; font-weight: 700; justify-content: center; height: 36px; line-height: 1;" onclick="addCatalogItemToCart(${p.id}, '${safeName}', ${availableStock})">
              ${isOutOfStock ? 'Sem Estoque' : 'Enviar Carrinho'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function openImagePreview(imgSrc, productName) {
  const imgEl = document.getElementById('image-preview-src');
  const titleEl = document.getElementById('image-preview-title');
  if (imgEl) imgEl.src = imgSrc;
  if (titleEl) titleEl.textContent = productName;
  openModal('modal-image-preview');
}

async function addCatalogItemToCart(productId, productName, maxAvailable) {
  const input = document.getElementById(`catalog-qty-${productId}`);
  const qtyVal = input ? parseInt(input.value, 10) : 1;

  if (isNaN(qtyVal) || qtyVal <= 0) {
    showToast('Por favor, informe uma quantidade válida!', 'error');
    return;
  }

  if (maxAvailable !== undefined && qtyVal > maxAvailable) {
    showToast(`A quantidade (${qtyVal} un) excede o estoque disponível (${maxAvailable} un)!`, 'error');
    return;
  }

  try {
    const res = await fetch('/api/cart/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, quantity: qtyVal })
    });

    if (!res.ok) {
      const data = await res.json();
      showToast('Erro ao adicionar produto: ' + (data.error || 'Falha na requisição'), 'error');
      return;
    }

    // Recarrega o carrinho (atualiza badge do topo e abate estoque do catálogo visualmente)
    await loadCart();

    showToast(`<strong>${qtyVal} un</strong> de "${productName}" adicionado(s) ao carrinho!`, 'success');
  } catch (err) {
    showToast('Erro de conexão ao adicionar produto ao carrinho.', 'error');
  }
}

function renderProductsSelect(products) {
  const select = document.getElementById('select-cart-product');
  if (!select) return;

  select.innerHTML = '<option value="">-- Selecione um Produto --</option>';
  products.forEach(p => {
    const stockVal = p.stock_qty !== undefined && p.stock_qty !== null ? p.stock_qty : 0;
    select.innerHTML += `
      <option value="${p.id}">
        [${p.code}] ${p.name} (Estoque: ${stockVal} un | Caixa: máx ${p.max_qty_per_box || 1} un)
      </option>
    `;
  });
}

function renderProductsTable(products) {
  const tbody = document.getElementById('products-table-body');
  if (!tbody) return;

  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">Nenhum produto cadastrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = products.map(p => {
    const uWeight = parseFloat(p.unit_weight !== undefined ? p.unit_weight : p.unit_weight_kg || 0);
    const uLen = p.unit_length !== undefined ? p.unit_length : p.unit_length_cm || 0;
    const uWid = p.unit_width !== undefined ? p.unit_width : p.unit_width_cm || 0;
    const uHei = p.unit_height !== undefined ? p.unit_height : p.unit_height_cm || 0;
    
    const bLen = p.box_length !== undefined ? p.box_length : p.box_length_cm || 0;
    const bWid = p.box_width !== undefined ? p.box_width : p.box_width_cm || 0;
    const bHei = p.box_height !== undefined ? p.box_height : p.box_height_cm || 0;
    const bWeight = parseFloat(p.box_weight !== undefined ? p.box_weight : p.box_empty_weight_kg || 0);
    const stockVal = p.stock_qty !== undefined && p.stock_qty !== null ? p.stock_qty : 0;

    return `
      <tr>
        <td><strong>${p.code}</strong></td>
        <td><span style="font-weight: 600; color: var(--text-secondary); font-size: 0.85rem;">${p.order_number || '-'}</span></td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            ${p.image_url ? `<img src="${p.image_url}" style="width: 28px; height: 28px; object-fit: cover; border-radius: 4px;" onerror="this.style.display='none'">` : ''}
            <div>
              <strong>${p.name}</strong><br>
              <small style="color: var(--text-muted);">Estoque: ${stockVal} un</small>
            </div>
          </div>
        </td>
        <td>${uWeight.toFixed(3)} kg</td>
        <td>${uLen}x${uWid}x${uHei} cm</td>
        <td><span class="badge badge-quoted">${p.max_qty_per_box || 1} un</span></td>
        <td>${bLen}x${bWid}x${bHei} cm</td>
        <td>${bWeight.toFixed(3)} kg</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="editProduct(${p.id})">Editar</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct(${p.id})">Excluir</button>
        </td>
      </tr>
    `;
  }).join('');
}

/* ==========================================================================
   3. GESTÃO DO CARRINHO DE ENVIO (COLETIVO)
   ========================================================================== */
let currentCart = null;
let selectedCartItemIds = new Set();

function syncCartSelectionState(items) {
  const currentIds = new Set(items.map(i => i.id));
  items.forEach(i => {
    if (!selectedCartItemIds.has(i.id)) {
      selectedCartItemIds.add(i.id);
    }
  });
  selectedCartItemIds.forEach(id => {
    if (!currentIds.has(id)) {
      selectedCartItemIds.delete(id);
    }
  });
}

async function loadCart() {
  try {
    const res = await fetch('/api/cart');
    const data = await res.json();

    // Normaliza os dados do servidor (caso retorne um array simples ou objeto .items)
    const rawItems = Array.isArray(data) ? data : (data.items || []);
    
    currentCart = {
      items: rawItems.map(item => {
        const id = item.cart_item_id || item.id;
        const productName = item.name || item.product_name || 'Produto';
        const maxBox = item.max_qty_per_box || 1;
        const qty = item.quantity || 1;
        const estimatedVolumes = Math.ceil(qty / maxBox);
        const boxLength = item.box_length || item.box_length_cm || 0;
        const boxWidth = item.box_width || item.box_width_cm || 0;
        const boxHeight = item.box_height || item.box_height_cm || 0;

        return {
          id: id,
          product_id: item.product_id || item.id,
          code: item.code || 'PRD',
          product_name: productName,
          image_url: item.image_url || '/images/garrafa.png',
          quantity: qty,
          max_qty_per_box: maxBox,
          estimated_volumes: estimatedVolumes,
          box_length_cm: boxLength,
          box_width_cm: boxWidth,
          box_height_cm: boxHeight,
          unit_weight: item.unit_weight || 0,
          unit_length: item.unit_length || 0,
          unit_width: item.unit_width || 0,
          unit_height: item.unit_height || 0
        };
      })
    };

    syncCartSelectionState(currentCart.items);
    renderCartTable(currentCart);
    updateCartHeaderBadge(currentCart);

    // Re-renderizar catálogo para atualizar visualmente o estoque disponível abatido
    if (cachedProducts && cachedProducts.length > 0) {
      renderMyProductsCatalog(cachedProducts);
    }
  } catch (err) {
    console.error('Erro ao carregar carrinho:', err);
  }
}

function updateCartHeaderBadge(cart) {
  const badge = document.getElementById('cart-header-badge');
  if (!badge) return;

  const items = cart && cart.items ? cart.items : [];
  const totalUnits = items.reduce((acc, item) => acc + (item.quantity || 0), 0);

  if (totalUnits > 0) {
    badge.textContent = totalUnits;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function toggleCartItemSelection(itemId, isChecked) {
  if (isChecked) {
    selectedCartItemIds.add(itemId);
  } else {
    selectedCartItemIds.delete(itemId);
  }

  const selectAllCb = document.getElementById('cart-select-all');
  if (selectAllCb && currentCart && currentCart.items) {
    selectAllCb.checked = currentCart.items.length > 0 && currentCart.items.every(i => selectedCartItemIds.has(i.id));
  }

  if (currentCart) renderCartTable(currentCart);
}

function toggleSelectAllCartItems(isChecked) {
  if (!currentCart || !currentCart.items) return;

  if (isChecked) {
    currentCart.items.forEach(i => selectedCartItemIds.add(i.id));
  } else {
    selectedCartItemIds.clear();
  }

  if (currentCart) renderCartTable(currentCart);
}

function renderCartTable(cart) {
  const tbody = document.getElementById('cart-table-body');
  if (!tbody) return;

  if (!cart || !cart.items || cart.items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
          <div style="font-size: 1.05rem; margin-bottom: 0.85rem; color: var(--text-secondary); font-weight: 600;">Nenhum produto adicionado ao carrinho de envio.</div>
          <button class="btn btn-primary" onclick="switchTab('tab-my-products')" style="font-weight: 700; padding: 0.6rem 1.25rem;">
            FAZER UM NOVO ENVIO
          </button>
        </td>
      </tr>`;
    document.getElementById('quotes-result-container')?.classList.add('hidden');
    return;
  }

  const selectAllCb = document.getElementById('cart-select-all');
  if (selectAllCb) {
    selectAllCb.checked = cart.items.length > 0 && cart.items.every(i => selectedCartItemIds.has(i.id));
  }

  tbody.innerHTML = cart.items.map(item => {
    const isChecked = selectedCartItemIds.has(item.id);
    const imgSrc = item.image_url || '/images/garrafa.png';
    const safeName = (item.product_name || 'Produto').replace(/'/g, "\\'");

    return `
      <tr style="${isChecked ? 'background-color: rgba(59, 130, 246, 0.03);' : 'opacity: 0.55;'}">
        <td style="text-align: center;">
          <input type="checkbox" class="cart-item-checkbox" data-id="${item.id}" ${isChecked ? 'checked' : ''} onchange="toggleCartItemSelection(${item.id}, this.checked)" style="cursor: pointer; width: 16px; height: 16px;">
        </td>
        <td style="text-align: center;">
          <img src="${imgSrc}" alt="${item.product_name}" onclick="openImagePreview('${imgSrc}', '${safeName}')" style="width: 44px; height: 44px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border-color); cursor: pointer;" title="Clique para ampliar" onerror="this.src='/images/garrafa.png'">
        </td>
        <td><strong>${item.code}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--text-primary);">${item.product_name}</div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <input type="number" value="${item.quantity}" min="1" style="width: 68px; padding: 0.25rem 0.4rem; font-weight: 700;" onchange="updateCartItemQty(${item.id}, this.value)">
            <span style="font-size: 0.82rem; color: var(--text-muted);">un</span>
          </div>
        </td>
        <td>Caixa (${item.box_length_cm}x${item.box_width_cm}x${item.box_height_cm} cm)</td>
        <td><span class="badge badge-approved">${item.estimated_volumes} vol</span></td>
        <td style="text-align: center;">
          <button class="btn btn-danger btn-sm" onclick="removeCartItem(${item.id})" style="padding: 0.25rem 0.5rem; font-size: 0.78rem;">Remover</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function updateCartItemQty(itemId, newQty) {
  try {
    await fetch(`/api/cart/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: parseInt(newQty) })
    });
    await loadCart();
  } catch (err) {
    alert('Erro ao atualizar quantidade.');
  }
}

async function removeCartItem(itemId) {
  try {
    await fetch(`/api/cart/items/${itemId}`, { method: 'DELETE' });
    await loadCart();
  } catch (err) {
    alert('Erro ao remover item.');
  }
}

/* ==========================================================================
   4. COTAÇÃO DE FRETE
   ========================================================================== */
let selectedQuoteOption = null;

async function calculateFreight(e) {
  if (e) e.preventDefault();

  if (!currentCart || !currentCart.items || currentCart.items.length === 0) {
    showToast('Nenhum produto no carrinho para cotar o frete!', 'error');
    return;
  }

  const selectedItems = currentCart.items.filter(item => selectedCartItemIds.has(item.id));
  if (selectedItems.length === 0) {
    showToast('Selecione ao menos 1 produto na lista (marcando a caixa de seleção) para cotar o frete!', 'error');
    return;
  }

  const destCepInput = document.getElementById('input-dest-cep');
  const rawCep = destCepInput ? destCepInput.value.trim() : '';
  const destCep = rawCep.replace(/\D/g, '');

  if (!destCep || destCep.length < 8) {
    showToast('Informe um CEP de destino válido (com 8 dígitos) para cotar o frete!', 'error');
    if (destCepInput) destCepInput.focus();
    return;
  }

  const btn = document.getElementById('btn-calculate-freight');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Cotando frete...';
  }

  try {
    const res = await fetch('/api/shipments/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dest_cep: destCep })
    });

    const data = await res.json();

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Calcular Frete';
    }

    if (!res.ok || data.error) {
      showToast('Erro na cotação: ' + (data.error || 'Falha ao cotar frete'), 'error');
      return;
    }

    renderQuotes(data.quotes, {
      total_packages: data.total_volumes,
      total_weight_kg: data.total_weight,
      packages: data.packages
    });

    showToast('Cotação de frete calculada com sucesso!', 'success');
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Calcular Frete';
    }
    showToast('Erro de comunicação ao cotar frete: ' + err.message, 'error');
  }
}

function renderQuotes(quotes, packageSummary) {
  const container = document.getElementById('quotes-result-container');
  const summaryText = document.getElementById('quote-summary-text');
  const grid = document.getElementById('quotes-grid');
  
  if (!container || !grid) return;
  container.classList.remove('hidden');

  const totalPackages = packageSummary?.total_packages || 0;
  const totalWeightKg = (packageSummary?.total_weight_kg || 0).toFixed(3);

  if (summaryText) {
    summaryText.innerHTML = `
      Cotação calculada para <strong>${totalPackages} volume(s)</strong> | 
      Peso Total: <strong>${totalWeightKg} kg</strong>
    `;
  }

  grid.innerHTML = (quotes || []).map((q, idx) => {
    const finalPrice = (q.final_price || 0).toFixed(2);
    const costPrice = (q.cost_price ?? q.raw_price ?? 0).toFixed(2);
    const markupPercent = q.markup_percent ?? 0;
    const deliveryDays = q.delivery_days ?? 0;

    return `
      <div class="quote-card ${idx === 0 ? 'selected' : ''}" onclick="selectQuoteCard(this, ${JSON.stringify(q).replace(/"/g, '&quot;')})">
        <div class="quote-carrier">${q.carrier || 'Transportadora'}</div>
        <div class="quote-service">${q.service || 'Serviço'}</div>
        <div class="quote-price">R$ ${finalPrice}</div>
        <div class="quote-details">
          <span>Prazo: <strong>${deliveryDays} dias úteis</strong></span><br>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Preço de Custo: R$ ${costPrice} (+${markupPercent}%)</span>
        </div>
      </div>
    `;
  }).join('');

  if (quotes && quotes.length > 0) {
    selectedQuoteOption = quotes[0];
    const confirmBtn = document.getElementById('btn-confirm-quote-step');
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

function selectQuoteCard(cardEl, quoteObj) {
  document.querySelectorAll('.quote-card').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');
  selectedQuoteOption = quoteObj;
  const confirmBtn = document.getElementById('btn-confirm-quote-step');
  if (confirmBtn) confirmBtn.disabled = false;
}

/* --------------------------------------------------------------------------
   CONFIRMAÇÃO DO FRETE E AUTO-PREENCHIMENTO DO ENDEREÇO VIA VIACEP
   -------------------------------------------------------------------------- */
async function confirmQuoteStep() {
  if (!selectedQuoteOption) {
    showToast('Selecione uma opção de frete para continuar!', 'error');
    return;
  }

  const destCep = document.getElementById('input-dest-cep').value.trim();
  const addressSection = document.getElementById('section-destination-address');
  const finalCepInput = document.getElementById('final-input-cep');
  const badgeFreight = document.getElementById('badge-selected-freight');

  if (finalCepInput) finalCepInput.value = destCep;
  if (badgeFreight) {
    badgeFreight.textContent = `${selectedQuoteOption.carrier} (${selectedQuoteOption.service}) — R$ ${(selectedQuoteOption.final_price || 0).toFixed(2)}`;
  }

  if (addressSection) {
    addressSection.classList.remove('hidden');
    addressSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Buscar endereço automaticamente via ViaCEP
  await fetchAddressByCep(destCep);
}

function cancelAddressStep() {
  const addressSection = document.getElementById('section-destination-address');
  if (addressSection) addressSection.classList.add('hidden');
}

async function fetchAddressByCep(cep) {
  const cleanCep = (cep || '').replace(/\D/g, '');
  if (cleanCep.length !== 8) return;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.erro) return;

    if (data.logradouro) document.getElementById('final-input-street').value = data.logradouro;
    if (data.bairro) document.getElementById('final-input-bairro').value = data.bairro;
    if (data.localidade) document.getElementById('final-input-city').value = data.localidade;
    if (data.uf) document.getElementById('final-input-uf').value = data.uf;

    showToast('Endereço autocompletado com sucesso pelo CEP!', 'success');
  } catch (err) {
    console.warn('Erro ao consultar ViaCEP:', err);
  }
}

function initFormEvents() {
  document.getElementById('btn-clear-cart')?.addEventListener('click', clearCart);
  document.getElementById('form-quote-freight')?.addEventListener('submit', calculateFreight);
  document.getElementById('btn-calculate-freight')?.addEventListener('click', calculateFreight);
}

async function clearCart() {
  if (!confirm('Deseja realmente limpar todos os produtos do carrinho de envio?')) return;
  try {
    const res = await fetch('/api/cart', { method: 'DELETE' });
    if (res.ok) {
      selectedCartItemIds.clear();
      showToast('Carrinho limpo com sucesso!', 'success');
      await loadCart();
    }
  } catch (err) {
    showToast('Erro ao limpar carrinho.', 'error');
  }
}

/* ==========================================================================
   5. GERAÇÃO DE REMESSA (COM ENDEREÇO COMPLETO)
   ========================================================================== */
async function confirmAndCreateShipment(e) {
  if (e) e.preventDefault();

  if (!selectedQuoteOption) {
    showToast('Por favor, selecione uma opção de frete antes de confirmar!', 'error');
    return;
  }

  const recipientName = document.getElementById('final-input-name').value.trim();
  const street = document.getElementById('final-input-street').value.trim();
  const number = document.getElementById('final-input-number').value.trim();
  const bairro = document.getElementById('final-input-bairro').value.trim();
  const city = document.getElementById('final-input-city').value.trim();
  const uf = document.getElementById('final-input-uf').value.trim();
  const complement = document.getElementById('final-input-complement').value.trim();
  const destCep = document.getElementById('final-input-cep').value.trim();

  if (!recipientName || !street || !number) {
    showToast('Preencha os campos obrigatórios do destinatário (Nome, Rua e Número)!', 'error');
    return;
  }

  const fullAddress = `${street}, nº ${number}${bairro ? ' - Bairro ' + bairro : ''}${complement ? ' (' + complement + ')' : ''}`;

  const selectedItems = (currentCart && currentCart.items)
    ? currentCart.items.filter(item => selectedCartItemIds.has(item.id))
    : [];

  if (selectedItems.length === 0) {
    showToast('Selecione ao menos 1 produto marcado no carrinho para gerar a remessa.', 'error');
    return;
  }

  const btn = document.getElementById('btn-confirm-shipment');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Gerando remessa...';
  }

  try {
    const activeClientId = (currentAuthUser && currentAuthUser.role === 'client')
      ? currentAuthUser.id
      : (typeof activeManagingClientId !== 'undefined' && activeManagingClientId ? activeManagingClientId : null);

    const res = await fetch('/api/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: activeClientId,
        type: 'coletivo',
        recipient_name: recipientName,
        dest_cep: destCep,
        dest_address: fullAddress,
        dest_city: city,
        dest_state: uf,
        dest_number: number,
        dest_complement: complement,
        selected_carrier: selectedQuoteOption.carrier,
        selected_service: selectedQuoteOption.service,
        quoted_freight_cost: selectedQuoteOption.cost_price ?? selectedQuoteOption.raw_price ?? 0,
        markup_percent: selectedQuoteOption.markup_percent,
        final_freight_price: selectedQuoteOption.final_price,
        delivery_days: selectedQuoteOption.delivery_days,
        cart_items: selectedItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        }))
      })
    });

    const data = await res.json();

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Finalizar e Gerar Remessa';
    }

    if (!res.ok) {
      showToast('Erro ao gerar remessa: ' + (data.error || 'Falha na requisição'), 'error');
      return;
    }

    showToast(`Remessa <strong>${data.code}</strong> gerada com sucesso!`, 'success');

    // Se marcou para salvar em "Meus Endereços", cadastra automaticamente no banco
    const chkSave = document.getElementById('chk-save-to-my-addresses');
    if (chkSave && chkSave.checked) {
      try {
        await fetch('/api/addresses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: recipientName,
            recipient_name: recipientName,
            cep: destCep,
            address: street,
            number: number,
            complement: complement,
            neighborhood: bairro,
            city: city,
            state: uf
          })
        });
        chkSave.checked = false;
        loadAddresses();
      } catch (saveErr) {
        console.warn('Erro ao salvar endereço em Meus Endereços:', saveErr);
      }
    }
    
    // Se enviou apenas alguns itens, remover do carrinho individualmente; se enviou todos, limpar carrinho
    const totalCartCount = currentCart ? currentCart.items.length : 0;
    if (selectedItems.length < totalCartCount) {
      for (const item of selectedItems) {
        await fetch(`/api/cart/items/${item.id}`, { method: 'DELETE' });
      }
    } else {
      await fetch('/api/cart', { method: 'DELETE' });
    }

    // Esconder seção de endereço
    cancelAddressStep();

    // Recarregar estoque de produtos, carrinho e remessas
    await loadProducts();
    await loadCart();
    await loadShipments();

    // Redirecionar para a aba de Gestão de Remessas
    switchTab('tab-shipments');
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Finalizar e Gerar Remessa';
    }
    showToast('Erro de comunicação ao gerar remessa: ' + err.message, 'error');
  }
}

/* ==========================================================================
   6. GESTÃO DE REMESSAS (CARDS COM LINHA DO TEMPO)
   ========================================================================== */
let allDetailedShipments = [];
window.allDetailedShipments = allDetailedShipments;

async function loadShipments() {
  const container = document.getElementById('shipments-cards-container');
  if (!container) return;

  try {
    const res = await fetch('/api/shipments');
    const shipments = await res.json();
    window.cachedShipments = shipments;

    if (!shipments || shipments.length === 0) {
      window.allDetailedShipments = [];
      populateShipmentClientFilter([]);
      const countBadge = document.getElementById('shipments-count-badge');
      if (countBadge) countBadge.textContent = '0 remessas';

      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem 1.5rem;">
          <h3 style="color: var(--text-primary); font-weight: 700; margin-bottom: 0.25rem;">Nenhuma remessa gerada ainda</h3>
          <p style="color: var(--text-muted); font-size: 0.88rem;">Selecione seus produtos na aba 'Novo Envio', cote o frete e gere sua primeira remessa.</p>
        </div>
      `;
      return;
    }

    // Buscar detalhes de cada remessa para exibir produtos e fotos
    const detailedShipments = await Promise.all(
      shipments.map(async s => {
        try {
          const detailRes = await fetch(`/api/shipments/${s.id}`);
          if (detailRes.ok) {
            const data = await detailRes.json();
            if (s.client_name && !data.shipment.client_name) {
              data.shipment.client_name = s.client_name;
            }
            if (s.client_email && !data.shipment.client_email) {
              data.shipment.client_email = s.client_email;
            }
            return data;
          }
        } catch (e) {}
        return { shipment: s, items: [], packages: [] };
      })
    );

    window.allDetailedShipments = detailedShipments;
    populateShipmentClientFilter(detailedShipments);
    filterShipments();
  } catch (err) {
    console.error('Erro ao carregar remessas:', err);
    container.innerHTML = `<div class="card" style="color: var(--danger);">Erro ao carregar remessas: ${err.message}</div>`;
  }
}

function populateShipmentClientFilter(detailedShipments) {
  const select = document.getElementById('filter-shipment-client');
  if (!select) return;

  const currentVal = select.value;
  const clientsMap = new Map();

  // 1. Usar clientsList se já carregada
  if (Array.isArray(clientsList) && clientsList.length > 0) {
    clientsList.forEach(c => {
      if (c && c.id && c.name) {
        clientsMap.set(String(c.id), c.name);
      }
    });
  }

  // 2. Mesclar com clientes presentes nas remessas carregadas
  if (Array.isArray(detailedShipments)) {
    detailedShipments.forEach(({ shipment }) => {
      if (shipment && shipment.client_id && shipment.client_name) {
        clientsMap.set(String(shipment.client_id), shipment.client_name);
      }
    });
  }

  let html = '<option value="all">Todos os Clientes</option>';
  clientsMap.forEach((name, id) => {
    const count = Array.isArray(detailedShipments)
      ? detailedShipments.filter(d => String(d.shipment?.client_id) === String(id)).length
      : 0;
    const countBadge = count > 0 ? ` (${count})` : '';
    html += `<option value="${id}">${escapeHtml(name)}${countBadge}</option>`;
  });

  select.innerHTML = html;

  if (currentVal && clientsMap.has(currentVal)) {
    select.value = currentVal;
  } else {
    select.value = 'all';
  }
}

function filterShipments() {
  if (!window.allDetailedShipments) return;

  const clientFilter = document.getElementById('filter-shipment-client')?.value || 'all';
  const statusFilter = document.getElementById('filter-shipment-status')?.value || 'all';
  const searchFilter = (document.getElementById('filter-shipment-search')?.value || '').trim().toLowerCase();
  const countBadge = document.getElementById('shipments-count-badge');
  const btnClear = document.getElementById('btn-clear-shipment-filters');

  const isFilterActive = clientFilter !== 'all' || statusFilter !== 'all' || searchFilter !== '';

  if (btnClear) {
    btnClear.style.display = isFilterActive ? 'inline-block' : 'none';
  }

  const filtered = window.allDetailedShipments.filter(({ shipment, items }) => {
    const s = shipment || {};

    // 1. Filtro por Cliente
    if (clientFilter !== 'all') {
      if (String(s.client_id) !== String(clientFilter)) {
        return false;
      }
    }

    // 2. Filtro por Status
    if (statusFilter !== 'all') {
      const statusRaw = (s.status || 'separacao').toLowerCase();
      const isSeparacao = ['separacao', 'em_preparacao', 'draft', 'quoted'].includes(statusRaw);
      const isACaminho = ['a_caminho', 'dispatched'].includes(statusRaw);
      const isEntregue = ['entregue', 'delivered'].includes(statusRaw);

      if (statusFilter === 'preparacao' && !isSeparacao) return false;
      if (statusFilter === 'a_caminho' && !isACaminho) return false;
      if (statusFilter === 'entregue' && !isEntregue) return false;
    }

    // 3. Filtro por Termo de Busca
    if (searchFilter) {
      const matchCode = (s.code || '').toLowerCase().includes(searchFilter);
      const matchClient = (s.client_name || '').toLowerCase().includes(searchFilter);
      const matchRecipient = (s.recipient_name || '').toLowerCase().includes(searchFilter);
      const matchCity = (s.dest_city || '').toLowerCase().includes(searchFilter);
      const matchState = (s.dest_state || '').toLowerCase().includes(searchFilter);
      const matchTracking = (s.tracking_code || '').toLowerCase().includes(searchFilter);
      const matchCarrier = (s.selected_carrier || '').toLowerCase().includes(searchFilter);
      const matchItems = Array.isArray(items) && items.some(it => 
        (it.product_name || '').toLowerCase().includes(searchFilter) || 
        (it.product_code || '').toLowerCase().includes(searchFilter)
      );

      if (!matchCode && !matchClient && !matchRecipient && !matchCity && !matchState && !matchTracking && !matchCarrier && !matchItems) {
        return false;
      }
    }

    return true;
  });

  if (countBadge) {
    const total = window.allDetailedShipments.length;
    if (isFilterActive) {
      countBadge.textContent = `${filtered.length} de ${total} ${total === 1 ? 'remessa' : 'remessas'}`;
    } else {
      countBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'remessa' : 'remessas'}`;
    }
  }

  renderShipmentCards(filtered, isFilterActive);
}

function clearShipmentFilters() {
  const clientSelect = document.getElementById('filter-shipment-client');
  const statusSelect = document.getElementById('filter-shipment-status');
  const searchInput = document.getElementById('filter-shipment-search');

  if (clientSelect) clientSelect.value = 'all';
  if (statusSelect) statusSelect.value = 'all';
  if (searchInput) searchInput.value = '';

  filterShipments();
}

window.filterShipments = filterShipments;
window.clearShipmentFilters = clearShipmentFilters;
window.populateShipmentClientFilter = populateShipmentClientFilter;

function renderShipmentCards(detailedShipments, isFiltered = false) {
  const container = document.getElementById('shipments-cards-container');
  if (!container) return;

  if (!detailedShipments || detailedShipments.length === 0) {
    if (isFiltered) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem 1.5rem;">
          <h3 style="color: var(--text-primary); font-weight: 700; margin-bottom: 0.35rem;">Nenhuma remessa encontrada</h3>
          <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 1.25rem;">Nenhuma remessa corresponde aos filtros de cliente, status ou busca selecionados.</p>
          <button type="button" class="btn btn-secondary btn-sm" onclick="clearShipmentFilters()">Limpar Filtros</button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 3rem 1.5rem;">
          <h3 style="color: var(--text-primary); font-weight: 700; margin-bottom: 0.25rem;">Nenhuma remessa gerada ainda</h3>
          <p style="color: var(--text-muted); font-size: 0.88rem;">Selecione seus produtos na aba 'Novo Envio', cote o frete e gere sua primeira remessa.</p>
        </div>
      `;
    }
    return;
  }

  container.innerHTML = detailedShipments.map(({ shipment, items, packages }) => {
    const s = shipment;
    const firstItem = items && items.length > 0 ? items[0] : null;
    const totalItemsCount = items ? items.reduce((acc, i) => acc + i.quantity, 0) : 0;

    const itemTitle = firstItem 
      ? (items.length === 1 ? firstItem.product_name : `${firstItem.product_name} (+${items.length - 1} item)`)
      : 'Itens da Remessa';

    const itemThumb = (firstItem && firstItem.image_url) ? firstItem.image_url : 'https://placehold.co/100x100?text=Produto';

    // Determinar Status e Etapas da Linha do Tempo
    let statusRaw = (s.status || 'separacao').toLowerCase();
    
    // Normalizar status
    let isSeparacao = ['separacao', 'em_preparacao', 'draft', 'quoted'].includes(statusRaw);
    let isACaminho = ['a_caminho', 'dispatched'].includes(statusRaw);
    let isEntregue = ['entregue', 'delivered'].includes(statusRaw);

    let statusTitleText = 'Em preparação';
    let statusHeadlineText = 'Separação do pedido';
    let statusSubtitleText = 'Em breve, informaremos o horário em que vamos chegar no seu endereço.';

    if (isACaminho) {
      statusTitleText = 'Envio no prazo';
      statusHeadlineText = `Chegará em ${s.delivery_days || 3} dias úteis`;
      statusSubtitleText = s.tracking_code 
        ? `Código de Rastreio: <strong>${s.tracking_code}</strong> | Despachado via ${s.selected_carrier || 'Transportadora'}` 
        : `Em transporte com a transportadora ${s.selected_carrier || ''}.`;
    } else if (isEntregue) {
      statusTitleText = 'Entregue';
      statusHeadlineText = 'Pedido Entregue no Destino';
      statusSubtitleText = 'Entregue com sucesso no endereço cadastrado.';
    }

    const createdDate = s.created_at ? new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

    return `
      <div class="shipment-card">
        <!-- Top Bar: Status & Badge do Cliente à Esquerda | Código & Transportadora à Direita -->
        <div class="shipment-card-top-bar">
          <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
            <span style="font-size: 0.95rem; font-weight: 700; color: ${isEntregue ? '#16a34a' : (isACaminho ? '#0284c7' : '#d97706')};">
              ${isEntregue ? 'Entregue' : (isACaminho ? 'A caminho' : 'Em preparação')}
            </span>

            <!-- Identificação do Cliente (Sem ícones, neutro) -->
            <span style="font-size: 0.82rem; font-weight: 600; color: #475569; background: #ffffff; border: 1px solid #cbd5e1; padding: 0.22rem 0.65rem; border-radius: 6px;">
              Cliente: <strong style="color: #0f172a;">${escapeHtml(s.client_name || 'Personaliza Brindes')}</strong>
            </span>
          </div>

          <div style="display: flex; align-items: center; gap: 0.6rem; text-align: right; flex-wrap: wrap;">
            <span style="font-weight: 600; color: var(--text-muted); font-size: 0.82rem; font-family: monospace;">Código: ${s.code}</span>
            <span style="color: var(--text-muted);">|</span>
            <span style="color: var(--text-secondary); font-weight: 600; font-size: 0.85rem;">${s.selected_carrier} (${s.selected_service})</span>
          </div>
        </div>

        <!-- Grid do Card: Esquerda (Foto + Produto + Endereço Destino) | Direita (Timeline Compacta) -->
        <div class="shipment-card-grid">
          <!-- Coluna Esquerda: Foto + Dados + Endereço -->
          <div class="shipment-card-left-col">
            <img src="${itemThumb}" alt="Foto do Produto" class="shipment-product-thumb">
            <div class="shipment-info-details">
              <div class="shipment-product-title">
                ${itemTitle} <span style="font-weight: 400; color: var(--text-muted); font-size: 0.82rem;">(${totalItemsCount} un.)</span>
              </div>
              
              <!-- Bloco de Endereço de Destino -->
              <div class="shipment-address-block">
                <div><strong>${s.recipient_name || 'Destinatário não informado'}</strong></div>
                <div>${s.dest_address ? s.dest_address : 'Endereço não informado'}</div>
                <div>${s.dest_city || ''} ${s.dest_state ? '- ' + s.dest_state : ''} ${s.dest_cep ? '| CEP: ' + s.dest_cep : ''}</div>
              </div>

              <!-- Botões de Ação Inline (Fundo branco normal) -->
              <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap;">
                <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem; background: #ffffff; border: 1px solid #cbd5e1; color: #334155;" onclick="openShipmentDetailModal(${s.id})">Ver Detalhe</button>
                <button class="btn btn-secondary admin-only ${currentRole === 'admin' ? '' : 'hidden'}" style="padding: 0.35rem 0.75rem; font-size: 0.78rem; background: #ffffff; border: 1px solid #cbd5e1; color: #334155;" onclick="openUpdateStatusModal(${s.id}, '${s.status}', '${s.tracking_code || ''}')">Atualizar Status (Admin)</button>
              </div>
            </div>
          </div>

          <!-- Coluna Direita: Linha do Tempo Compacta -->
          <div class="shipment-timeline-compact">
            <div class="timeline-step-compact ${isSeparacao ? 'active' : 'completed'}">
              <div class="timeline-dot"></div>
              <div class="timeline-step-compact-title">
                Em preparação ${createdDate ? `<span style="font-weight: 400; font-size: 0.74rem; color: #94a3b8;">(${createdDate})</span>` : ''}
              </div>
              <div class="timeline-step-compact-subtext">Separação do pedido no estoque.</div>
            </div>

            <div class="timeline-step-compact ${isACaminho ? 'active' : (isEntregue ? 'completed' : '')}">
              <div class="timeline-dot"></div>
              <div class="timeline-step-compact-title">A caminho</div>
              <div class="timeline-step-compact-subtext">
                ${isACaminho || isEntregue 
                  ? (s.tracking_code ? `Rastreio: <strong style="color: #0f172a;">${s.tracking_code}</strong> (${s.selected_carrier})` : `Em trânsito com a transportadora.`) 
                  : 'Aguardando despacho pelo admin.'}
              </div>
            </div>

            <div class="timeline-step-compact step-entrega ${isEntregue ? 'active delivered' : ''}">
              <div class="timeline-dot ${isEntregue ? 'dot-delivered' : ''}"></div>
              <div class="timeline-step-compact-title ${isEntregue ? 'title-delivered' : ''}">Entrega</div>
              <div class="timeline-step-compact-subtext">
                ${isEntregue ? 'Pedido entregue no destino final.' : 'Aguardando entrega no endereço.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* --------------------------------------------------------------------------
   MODAIS DE DETALHE E ATUALIZAÇÃO DE STATUS DA REMESSA
   -------------------------------------------------------------------------- */
async function openShipmentDetailModal(shipmentId) {
  try {
    const res = await fetch(`/api/shipments/${shipmentId}`);
    if (!res.ok) return showToast('Erro ao carregar detalhes da remessa.', 'error');

    const data = await res.json();
    const s = data.shipment;
    const items = data.items || [];
    const packages = data.packages || [];

    document.getElementById('shipment-detail-title').textContent = `Remessa ${s.code}`;

    const body = document.getElementById('shipment-detail-body');
    body.innerHTML = `
      <!-- Identificação do Cliente / Empresa (Sem ícone) -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.75rem 1rem; display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <span style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Cliente / Solicitante da Remessa</span>
          <div style="font-size: 1.05rem; font-weight: 800; color: #0f172a; margin-top: 2px;">
            ${escapeHtml(s.client_name || 'Personaliza Brindes')}
          </div>
        </div>
        ${s.client_email ? `
          <div style="font-size: 0.82rem; color: #475569; background: #ffffff; padding: 0.25rem 0.65rem; border-radius: 6px; border: 1px solid #cbd5e1;">
            ${escapeHtml(s.client_email)}
          </div>
        ` : ''}
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem; background: var(--bg-card-subtle); padding: 1rem; border-radius: 10px; border: 1px solid var(--border-color);">
        <div>
          <div style="font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Destinatário</div>
          <div style="font-weight: 700; font-size: 1rem; color: var(--text-primary);">${s.recipient_name || 'Não informado'}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">${s.dest_address || ''}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted);">${s.dest_city || ''} - ${s.dest_state || ''} | CEP: ${s.dest_cep}</div>
        </div>
        <div>
          <div style="font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Transporte & Valores</div>
          <div style="font-weight: 700; color: var(--primary); font-size: 1rem;">${s.selected_carrier} (${s.selected_service})</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">Valor do Frete: <strong>R$ ${(s.final_freight_price || 0).toFixed(2)}</strong></div>
          <div style="font-size: 0.85rem; color: var(--text-muted);">Prazo: ${s.delivery_days || 0} dias úteis</div>
          ${s.tracking_code ? `<div style="margin-top: 0.4rem; font-weight: 700; font-size: 0.88rem; color: var(--success-text);">Rastreio: ${s.tracking_code}</div>` : ''}
        </div>
      </div>

      <h4 style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--text-primary);">Produtos Inclusos na Remessa:</h4>
      <div style="margin-bottom: 1.25rem;">
        ${items.map(item => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0; border-bottom: 1px dashed var(--border-color);">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <img src="${item.image_url || 'https://placehold.co/50'}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-color);">
              <div>
                <div style="font-weight: 600; color: var(--text-primary);">${item.product_name}</div>
                <div style="font-size: 0.78rem; color: var(--text-muted);">Código: ${item.product_code}</div>
              </div>
            </div>
            <div style="font-weight: 700; font-size: 0.9rem;">${item.quantity} un.</div>
          </div>
        `).join('')}
      </div>

      <h4 style="font-weight: 700; font-size: 0.95rem; margin-bottom: 0.5rem; color: var(--text-primary);">Embalagens & Cubagem:</h4>
      <div style="font-size: 0.85rem; color: var(--text-secondary);">
        Total de Volumes: <strong>${s.total_volumes} volume(s)</strong> | Peso Total: <strong>${(s.total_weight || 0).toFixed(3)} kg</strong>
      </div>
    `;

    const actionsContainer = document.getElementById('shipment-detail-actions');
    if (actionsContainer) {
      actionsContainer.innerHTML = `
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary admin-only ${currentRole === 'admin' ? '' : 'hidden'}" onclick="printPickingSlip(${s.id})" style="font-size: 0.82rem; padding: 0.45rem 0.85rem; background: #ffffff; border: 1px solid #cbd5e1; color: #334155;">
            Ordem de Separação
          </button>
          <button type="button" class="btn btn-secondary admin-only ${currentRole === 'admin' ? '' : 'hidden'}" onclick="printShippingLabel(${s.id})" style="font-size: 0.82rem; padding: 0.45rem 0.85rem; background: #ffffff; border: 1px solid #cbd5e1; color: #334155;">
            Etiqueta de Envio
          </button>
        </div>
        <button type="button" class="btn btn-secondary" onclick="closeModal('modal-shipment-detail')" style="background: #ffffff; border: 1px solid #cbd5e1; color: #334155;">Fechar</button>
      `;
    }

    document.getElementById('modal-shipment-detail').classList.remove('hidden');
  } catch (err) {
    showToast('Erro ao abrir detalhes.', 'error');
  }
}

// --------------------------------------------------------------------------
//  GERAÇÃO E IMPRESSÃO DE ORDEM DE SEPARAÇÃO E ETIQUETA DE ENVIO
// --------------------------------------------------------------------------

function generateSVGBarcode(text) {
  const clean = String(text || '123456789').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  let bars = '11010110010110';
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    const pattern = (code * 15485863) % 2047;
    bars += pattern.toString(2).padStart(11, '0');
  }
  bars += '1100011101011';

  let svgBars = '';
  let x = 10;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i] === '1') {
      svgBars += `<rect x="${x}" y="5" width="2" height="45" fill="#000000" />`;
    }
    x += 2;
  }

  return `
    <svg width="${x + 10}" height="65" viewBox="0 0 ${x + 10} 65" xmlns="http://www.w3.org/2000/svg" style="max-width: 100%; display: block; margin: 0 auto;">
      ${svgBars}
      <text x="${(x + 10) / 2}" y="60" font-family="monospace" font-size="11" font-weight="bold" text-anchor="middle" fill="#000000">${clean}</text>
    </svg>
  `;
}

async function printPickingSlip(shipmentId) {
  if (currentRole !== 'admin') {
    return showToast('Acesso permitido apenas para o perfil de Administrador.', 'warning');
  }
  try {
    const res = await fetch(`/api/shipments/${shipmentId}`);
    if (!res.ok) return showToast('Erro ao obter dados da remessa.', 'error');
    const data = await res.json();
    const s = data.shipment;
    const items = data.items || [];

    const printWin = window.open('', '_blank', 'width=800,height=900');
    if (!printWin) return showToast('Permita pop-ups no navegador para visualizar a Ordem de Separação.', 'warning');

    const formattedDate = s.created_at 
      ? new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
      : new Date().toLocaleDateString('pt-BR');

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Ordem de Separação - ${s.code}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; line-height: 1.4; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
          .logo { font-size: 1.5rem; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
          .subtitle { font-size: 0.85rem; color: #475569; margin-top: 2px; }
          .doc-title { text-align: right; }
          .doc-title h2 { margin: 0; font-size: 1.25rem; color: #0f172a; font-weight: 800; }
          .doc-title p { margin: 2px 0 0 0; font-size: 0.85rem; color: #475569; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 15px; }
          .info-box h4 { margin: 0 0 6px 0; font-size: 0.75rem; text-transform: uppercase; color: #475569; font-weight: 700; letter-spacing: 0.5px; }
          .info-box p { margin: 0; font-size: 0.9rem; font-weight: 600; color: #0f172a; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
          .table th { background: #0f172a; color: #ffffff; text-align: left; padding: 10px 12px; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.5px; }
          .table td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; }
          .table tr:nth-child(even) { background: #f8fafc; }
          .checkbox-cell { text-align: center; width: 60px; }
          .checkbox-box { display: inline-block; width: 20px; height: 20px; border: 2px solid #64748b; border-radius: 4px; }
          .summary-box { background: #f1f5f9; border-radius: 8px; padding: 12px 15px; margin-bottom: 30px; font-size: 0.9rem; display: flex; justify-content: space-between; border: 1px solid #cbd5e1; }
          .footer-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; }
          .sign-line { border-top: 1px solid #64748b; text-align: center; padding-top: 6px; font-size: 0.85rem; color: #334155; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">PERSONALIZA BRINDES</div>
            <div class="subtitle">Sistema de Gestão Logística & Expedição</div>
          </div>
          <div class="doc-title">
            <h2>ORDEM DE SEPARAÇÃO</h2>
            <p>Remessa: <strong>${s.code}</strong></p>
            <p>Data: ${formattedDate}</p>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-box">
            <h4>CLIENTE / SOLICITANTE</h4>
            <p style="font-size: 1.05rem; color: #4338ca; font-weight: 800;">${s.client_name || 'Personaliza Brindes'}</p>
            ${s.client_email ? `<p style="font-size: 0.82rem; color: #64748b; margin-top: 3px;">${s.client_email}</p>` : ''}
          </div>
          <div class="info-box">
            <h4>DESTINATÁRIO & ENDEREÇO</h4>
            <p style="font-size: 1rem; color: #0284c7; font-weight: 800;">${s.recipient_name || 'Cliente'}</p>
            <p>${s.dest_address || ''}</p>
            <p>${s.dest_city || ''} / ${s.dest_state || ''} — CEP: ${s.dest_cep || ''}</p>
          </div>
          <div class="info-box">
            <h4>TRANSPORTE & EXPEDIÇÃO</h4>
            <p style="font-size: 1rem;">${s.selected_carrier || 'Transportadora'} (${s.selected_service || 'Padrão'})</p>
            <p style="margin-top: 4px;">Volumes: <strong>${s.total_volumes || 1} volume(s)</strong> | Peso: <strong>${(s.total_weight || 0).toFixed(3)} kg</strong></p>
            ${s.tracking_code ? `<p style="color: #16a34a; margin-top: 4px;">Rastreio: ${s.tracking_code}</p>` : ''}
          </div>
        </div>

        <h3 style="font-size: 1rem; margin-bottom: 10px; color: #0f172a; font-weight: 800;">ITENS A SEREM SEPARADOS NO ESTOQUE</h3>
        <table class="table">
          <thead>
            <tr>
              <th style="width: 50px;">Item</th>
              <th style="width: 130px;">Código</th>
              <th>Descrição do Produto</th>
              <th style="text-align: center; width: 110px;">Qtd. Separar</th>
              <th class="checkbox-cell">Conferido</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => `
              <tr>
                <td><strong>#${idx + 1}</strong></td>
                <td><code style="background: #e2e8f0; padding: 3px 6px; border-radius: 4px; font-weight: 700;">${item.product_code}</code></td>
                <td><strong>${item.product_name}</strong></td>
                <td style="text-align: center; font-size: 1.1rem; font-weight: 800; color: #0284c7;">${item.quantity} un.</td>
                <td class="checkbox-cell"><span class="checkbox-box"></span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="summary-box">
          <div>Tipos de Produtos: <strong>${items.length} item(ns)</strong></div>
          <div>Total de Unidades a Separar: <strong>${items.reduce((acc, curr) => acc + curr.quantity, 0)} unidades</strong></div>
        </div>

        <div class="footer-sign">
          <div class="sign-line">
            Separado por (Nome / Rubrica)
          </div>
          <div class="sign-line">
            Conferido por (Nome / Rubrica)
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          }
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  } catch (err) {
    showToast('Erro ao gerar Ordem de Separação.', 'error');
  }
}

async function printShippingLabel(shipmentId) {
  if (currentRole !== 'admin') {
    return showToast('Acesso permitido apenas para o perfil de Administrador.', 'warning');
  }
  try {
    const res = await fetch(`/api/shipments/${shipmentId}`);
    if (!res.ok) return showToast('Erro ao obter dados da remessa.', 'error');
    const data = await res.json();
    const s = data.shipment;

    const printWin = window.open('', '_blank', 'width=500,height=700');
    if (!printWin) return showToast('Permita pop-ups no navegador para visualizar a Etiqueta de Envio.', 'warning');

    const barcodeSVG = generateSVGBarcode(s.tracking_code || s.code);

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Etiqueta de Envio - ${s.code}</title>
        <style>
          @page { size: 100mm 150mm; margin: 0; }
          body { font-family: Arial, sans-serif; color: #000000; margin: 0; padding: 8px; width: 96mm; height: 146mm; box-sizing: border-box; background: #fff; }
          .label-container { border: 3px solid #000000; border-radius: 4px; padding: 10px; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; }
          .header { border-bottom: 3px solid #000000; padding-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
          .carrier-name { font-size: 1.4rem; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; }
          .service-name { font-size: 0.9rem; font-weight: 800; background: #000; color: #fff; padding: 3px 8px; border-radius: 3px; text-transform: uppercase; }
          .recipient-block { border-bottom: 3px solid #000000; padding: 10px 0; }
          .recipient-title { font-size: 0.72rem; font-weight: 900; text-transform: uppercase; color: #222; }
          .recipient-name { font-size: 1.15rem; font-weight: 900; margin: 4px 0; line-height: 1.2; }
          .recipient-address { font-size: 0.9rem; line-height: 1.35; margin-top: 4px; }
          .cep-badge { font-size: 1.25rem; font-weight: 900; background: #000; color: #fff; display: inline-block; padding: 4px 10px; margin-top: 8px; border-radius: 4px; letter-spacing: 1px; }
          .barcode-block { text-align: center; border-bottom: 3px solid #000000; padding: 10px 0; }
          .sender-block { padding-top: 8px; font-size: 0.75rem; line-height: 1.35; }
          .sender-title { font-weight: 900; text-transform: uppercase; color: #333; margin-bottom: 2px; }
          .footer-info { display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 900; border-top: 2px solid #000; padding-top: 6px; margin-top: 6px; }
        </style>
      </head>
      <body>
        <div class="label-container">
          <div class="header">
            <div class="carrier-name">${s.selected_carrier || 'TRANSPORTADORA'}</div>
            <div class="service-name">${s.selected_service || 'PADRÃO'}</div>
          </div>

          <div class="recipient-block">
            <div class="recipient-title">DESTINATÁRIO</div>
            <div class="recipient-name">${s.recipient_name || 'CLIENTE'}</div>
            <div class="recipient-address">
              ${s.dest_address || ''}<br>
              ${s.dest_city || ''} / ${s.dest_state || ''}
            </div>
            <div class="cep-badge">CEP: ${s.dest_cep || ''}</div>
          </div>

          <div class="barcode-block">
            <div style="font-size: 0.75rem; font-weight: 900; margin-bottom: 4px; text-transform: uppercase;">CÓDIGO DE RASTREIO / EXPEDIÇÃO</div>
            ${barcodeSVG}
          </div>

          <div>
            <div class="sender-block">
              <div class="sender-title">REMETENTE / CLIENTE</div>
              <strong>${s.client_name ? escapeHtml(s.client_name) + ' (Personaliza Flow)' : 'Personaliza Brindes Logística'}</strong><br>
              Rua Açucena, 100 — Bairro Jardim Eldorado<br>
              Palhoça / SC — CEP: 88133-700
            </div>

            <div class="footer-info">
              <span>REMESSA: ${s.code}</span>
              <span>VOL: 1/${s.total_volumes || 1}</span>
              <span>PESO: ${(s.total_weight || 0).toFixed(2)} KG</span>
            </div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          }
        </script>
      </body>
      </html>
    `);
    printWin.document.close();
  } catch (err) {
    showToast('Erro ao gerar Etiqueta de Envio.', 'error');
  }
}

function openUpdateStatusModal(shipmentId, currentStatus, currentTracking) {
  document.getElementById('status-shipment-id').value = shipmentId;
  
  let select = document.getElementById('select-shipment-status');
  if (select) {
    let normalized = (currentStatus || 'separacao').toLowerCase();
    if (['separacao', 'em_preparacao', 'draft', 'quoted'].includes(normalized)) select.value = 'separacao';
    else if (['a_caminho', 'dispatched'].includes(normalized)) select.value = 'a_caminho';
    else if (['entregue', 'delivered'].includes(normalized)) select.value = 'entregue';
  }

  const trackingInput = document.getElementById('input-shipment-tracking');
  if (trackingInput) trackingInput.value = currentTracking || '';

  document.getElementById('modal-update-status').classList.remove('hidden');
}

async function saveShipmentStatus(e) {
  if (e) e.preventDefault();

  const shipmentId = document.getElementById('status-shipment-id').value;
  const status = document.getElementById('select-shipment-status').value;
  const tracking_code = document.getElementById('input-shipment-tracking').value.trim();

  try {
    const res = await fetch(`/api/shipments/${shipmentId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, tracking_code })
    });

    const data = await res.json();
    if (!res.ok) return showToast('Erro ao atualizar status: ' + data.error, 'error');

    closeModal('modal-update-status');
    showToast('Status da remessa atualizado com sucesso!', 'success');
    await loadShipments();
  } catch (err) {
    showToast('Erro de conexão ao salvar status.', 'error');
  }
}

/* ==========================================================================
   7. CONFIGURAÇÕES
   ========================================================================== */
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();

    const originInput = document.getElementById('input-origin-cep');
    const markupInput = document.getElementById('input-markup-percent');
    if (originInput) originInput.value = settings.origin_cep || '';
    if (markupInput) markupInput.value = settings.default_markup_percent || 0;
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
  }

  await loadDisktenhaSummary();
}

/* --------------------------------------------------------------------------
   GESTÃO DA TRANSPORTADORA DISKTENHA
   -------------------------------------------------------------------------- */
async function loadDisktenhaSummary() {
  try {
    const res = await fetch('/api/settings/disktenha/summary');
    const data = await res.json();
    const statusBadge = document.getElementById('badge-disktenha-status');
    const totalCitiesEl = document.getElementById('disktenha-total-cities');
    if (data.active) {
      if (statusBadge) {
        statusBadge.textContent = '🟢 Ativo';
        statusBadge.style.background = '#10b981';
      }
      if (totalCitiesEl) {
        totalCitiesEl.textContent = `${data.total_cities} cidades (SC e PR)`;
      }
    } else {
      if (statusBadge) {
        statusBadge.textContent = '🔴 Inativo';
        statusBadge.style.background = '#ef4444';
      }
      if (totalCitiesEl) {
        totalCitiesEl.textContent = 'Planilha não encontrada';
      }
    }
  } catch (err) {
    console.error('Erro ao carregar resumo Disktenha:', err);
  }
}
window.loadDisktenhaSummary = loadDisktenhaSummary;

async function testDisktenhaCep() {
  const input = document.getElementById('input-disktenha-test-cep');
  const resultEl = document.getElementById('disktenha-test-result');
  if (!input || !resultEl) return;

  const cep = input.value.trim();
  if (!cep) {
    resultEl.innerHTML = '<span style="color: #ef4444;">Digite um CEP para testar.</span>';
    return;
  }

  resultEl.innerHTML = '<span style="color: #64748b;">Consultando tabela...</span>';

  try {
    const res = await fetch('/api/settings/disktenha/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cep })
    });
    const data = await res.json();

    if (data.covered && data.quote) {
      const q = data.quote;
      resultEl.innerHTML = `
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 0.6rem 0.75rem; color: #065f46;">
          ✅ <strong>Atendido!</strong> Cidade: <strong>${q.city}</strong><br>
          Custo Base: <strong>R$ ${q.price.toFixed(2)}</strong> | Prazo: <strong>${q.delivery_days} dias úteis</strong>
        </div>
      `;
    } else {
      resultEl.innerHTML = `
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 0.6rem 0.75rem; color: #991b1b;">
          ❌ <strong>Não atendido:</strong> ${data.message || 'Este CEP não está na área de entrega da Disktenha.'}
        </div>
      `;
    }
  } catch (err) {
    resultEl.innerHTML = `<span style="color: #ef4444;">Erro ao testar CEP: ${err.message}</span>`;
  }
}
window.testDisktenhaCep = testDisktenhaCep;

let cachedDisktenhaCities = [];

async function openDisktenhaCitiesModal() {
  openModal('modal-disktenha-cities');
  const tbody = document.getElementById('tbody-disktenha-cities');
  if (!tbody) return;

  if (!cachedDisktenhaCities || cachedDisktenhaCities.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1.5rem; color: #64748b;">Carregando cidades...</td></tr>';
    try {
      const res = await fetch('/api/settings/disktenha/cities');
      cachedDisktenhaCities = await res.json();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" style="color: #ef4444; text-align: center;">Erro: ${err.message}</td></tr>`;
      return;
    }
  }

  renderDisktenhaCitiesTable(cachedDisktenhaCities);
}
window.openDisktenhaCitiesModal = openDisktenhaCitiesModal;

function renderDisktenhaCitiesTable(cities) {
  const tbody = document.getElementById('tbody-disktenha-cities');
  const countEl = document.getElementById('disktenha-cities-count');
  if (!tbody) return;

  if (countEl) {
    countEl.textContent = `${cities.length} cidade(s) listada(s)`;
  }

  if (!cities || cities.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 1.5rem; color: #64748b;">Nenhuma cidade encontrada.</td></tr>';
    return;
  }

  tbody.innerHTML = cities.map(c => `
    <tr>
      <td style="font-weight: 700; color: #1e293b;">${escapeHtml(c.city)}</td>
      <td style="font-family: monospace; font-size: 0.85rem; color: #475569;">${formatDisktenhaCep(c.cepStart)} a ${formatDisktenhaCep(c.cepEnd)}</td>
      <td style="font-weight: 700; color: #059669;">R$ ${parseFloat(c.cost).toFixed(2)}</td>
      <td><span class="status-badge status-delivered" style="background: #e0f2fe; color: #0369a1; border-color: #bae6fd;">${c.days} dias úteis</span></td>
    </tr>
  `).join('');
}

function formatDisktenhaCep(val) {
  const s = String(val).padStart(8, '0');
  return s.slice(0, 5) + '-' + s.slice(5);
}

function filterDisktenhaCitiesList(query) {
  const term = (query || '').toLowerCase().trim();
  if (!term) {
    renderDisktenhaCitiesTable(cachedDisktenhaCities);
    return;
  }
  const filtered = cachedDisktenhaCities.filter(c => 
    c.city.toLowerCase().includes(term) ||
    String(c.cepStart).includes(term) ||
    String(c.cepEnd).includes(term)
  );
  renderDisktenhaCitiesTable(filtered);
}
window.filterDisktenhaCitiesList = filterDisktenhaCitiesList;

async function reloadDisktenhaTable() {
  try {
    const res = await fetch('/api/settings/disktenha/reload', { method: 'POST' });
    const data = await res.json();
    cachedDisktenhaCities = [];
    await loadDisktenhaSummary();
    showToast(data.message || 'Tabela Disktenha recarregada!');
  } catch (err) {
    alert('Erro ao recarregar tabela: ' + err.message);
  }
}
window.reloadDisktenhaTable = reloadDisktenhaTable;

/* ==========================================================================
   8. EVEN LISTENTERS & MODALS
   ========================================================================== */
function initFormEvents() {
  // Busca em tempo real no estoque de Meus Produtos
  document.getElementById('search-my-products')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = cachedProducts.filter(p => 
      p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)
    );
    renderMyProductsCatalog(filtered);
  });

  // Form Adicionar ao Carrinho
  document.getElementById('form-add-to-cart')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const productId = document.getElementById('select-cart-product').value;
    const qty = document.getElementById('input-cart-qty').value;

    if (!productId) return alert('Selecione um produto!');

    try {
      await fetch('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: parseInt(productId), quantity: parseInt(qty) })
      });
      await loadCart();
    } catch (err) {
      alert('Erro ao adicionar item ao carrinho.');
    }
  });

  // Limpar Carrinho
  document.getElementById('btn-clear-cart')?.addEventListener('click', async () => {
    if (!confirm('Deseja limpar todo o carrinho?')) return;
    await fetch('/api/cart', { method: 'DELETE' });
    await loadCart();
  });

  // Form Cotar Frete
  document.getElementById('form-quote-freight')?.addEventListener('submit', calculateFreight);

  // Confirmar Remessa
  document.getElementById('btn-confirm-shipment')?.addEventListener('click', confirmAndCreateShipment);

  // Form Configurações
  document.getElementById('form-settings')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cep = document.getElementById('input-origin-cep').value;
    const markup = document.getElementById('input-markup-percent').value;

    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin_cep: cep, default_markup_percent: parseFloat(markup) })
      });
      alert('Configurações salvas!');
    } catch (err) {
      alert('Erro ao salvar configurações.');
    }
  });

  // Botão Ver Resumo Embalagens
  document.getElementById('btn-calc-packages')?.addEventListener('click', async () => {
    if (!currentCart || !currentCart.items || currentCart.items.length === 0) {
      alert('Carrinho vazio!');
      return;
    }
    try {
      const res = await fetch('/api/cart/packages');
      const data = await res.json();
      showPackagesSummaryModal(data);
    } catch (err) {
      alert('Erro ao calcular embalagens.');
    }
  });

  // Botão Novo Produto
  document.getElementById('btn-open-new-product')?.addEventListener('click', () => {
    openProductForm();
  });

  // Form Salvar Produto
  document.getElementById('form-product')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('modal-product-id').value;
    
    // Obter cliente selecionado
    const selectedClientIdVal = document.getElementById('prod-client-select')?.value;
    let targetClientId = null;
    if (currentAuthUser && currentAuthUser.role === 'client') {
      targetClientId = currentAuthUser.id;
    } else if (selectedClientIdVal) {
      targetClientId = parseInt(selectedClientIdVal, 10);
    } else if (form.dataset.targetClientId) {
      targetClientId = parseInt(form.dataset.targetClientId, 10);
    }

    const rawStockInput = document.getElementById('prod-stock-qty')?.value;
    const parsedStockVal = parseInt(rawStockInput, 10);
    const stockQtyVal = !isNaN(parsedStockVal) ? Math.max(0, parsedStockVal) : 100;

    const payload = {
      client_id: targetClientId,
      code: document.getElementById('prod-code').value.trim(),
      name: document.getElementById('prod-name').value.trim(),
      order_number: document.getElementById('prod-order-number')?.value.trim() || '',
      stock_qty: stockQtyVal,
      description: document.getElementById('prod-description')?.value.trim() || '',
      image_url: document.getElementById('prod-image-url')?.value.trim() || '/images/garrafa.png',
      unit_weight: parseFloat(document.getElementById('prod-unit-weight').value) || 0,
      unit_height: parseFloat(document.getElementById('prod-unit-height').value) || 0,
      unit_width: parseFloat(document.getElementById('prod-unit-width').value) || 0,
      unit_length: parseFloat(document.getElementById('prod-unit-length').value) || 0,
      max_qty_per_box: parseInt(document.getElementById('prod-max-qty').value, 10) || 1,
      box_weight: parseFloat(document.getElementById('prod-box-weight').value) || 0.5,
      box_height: parseFloat(document.getElementById('prod-box-height').value) || 30,
      box_width: parseFloat(document.getElementById('prod-box-width').value) || 40,
      box_length: parseFloat(document.getElementById('prod-box-length').value) || 40
    };

    try {
      const url = id ? `/api/products/${id}` : '/api/products';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        showToast('Erro ao salvar produto: ' + (errData.error || 'Falha no servidor'), 'error');
        return;
      }

      delete form.dataset.targetClientId;

      await loadProducts();
      if (typeof loadClients === 'function') {
        await loadClients();
      }
      if (targetClientId && typeof loadClientProducts === 'function') {
        await loadClientProducts(targetClientId);
      } else if (productFormReturnClientId && typeof loadClientProducts === 'function') {
        await loadClientProducts(productFormReturnClientId);
      }

      showToast(id ? 'Produto atualizado com sucesso!' : 'Novo produto cadastrado com sucesso!');
      closeProductForm();
    } catch (err) {
      showToast('Erro ao salvar produto: ' + err.message, 'error');
    }
  });
}

let productFormReturnTab = 'tab-products';
let productFormReturnClientId = null;

async function populateProductClientSelect(selectedClientId = null) {
  const select = document.getElementById('prod-client-select');
  if (!select) return;

  select.innerHTML = '<option value="">Geral / Empresa Principal (Sem vínculo restrito)</option>';

  try {
    if (!clientsList || clientsList.length === 0) {
      const res = await fetch('/api/clients');
      if (res.ok) clientsList = await res.json();
    }

    if (Array.isArray(clientsList)) {
      clientsList.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} ${c.cnpj ? '(' + c.cnpj + ')' : ''}`;
        if (selectedClientId && String(c.id) === String(selectedClientId)) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });
    }
  } catch (e) {
    console.error('Erro ao listar clientes no formulário de produtos:', e);
  }
}

async function openProductForm(productId = null, targetClientId = null) {
  const form = document.getElementById('form-product');
  if (!form) return;

  // Descobre a página ativa atual para poder retornar exatamente para ela
  const activePage = document.querySelector('.tab-page:not(.hidden)');
  const currentActivePageId = activePage ? activePage.id : 'tab-products';

  if (targetClientId || currentActivePageId === 'page-client-detail') {
    productFormReturnTab = 'page-client-detail';
    productFormReturnClientId = targetClientId || activeManagingClientId || null;
  } else {
    productFormReturnTab = 'tab-products';
    productFormReturnClientId = null;
  }

  // Atualiza label do botão voltar
  const backLabel = document.getElementById('product-form-back-label');
  if (backLabel) {
    backLabel.textContent = (productFormReturnTab === 'page-client-detail')
      ? 'Voltar para o Cliente'
      : 'Voltar para Lista de Produtos';
  }

  // Reseta campos
  form.reset();
  const idInput = document.getElementById('modal-product-id');
  if (idInput) idInput.value = '';

  const previewContainer = document.getElementById('prod-image-preview-container');
  const previewImg = document.getElementById('prod-image-preview-img');
  if (previewContainer) previewContainer.style.display = 'none';

  const titleEl = document.getElementById('product-form-title');
  const subtitleEl = document.getElementById('product-form-subtitle');

  if (productId) {
    // MODO EDIÇÃO
    let p = cachedProducts.find(item => item.id === productId);
    if (!p) {
      try {
        const res = await fetch('/api/products');
        const all = await res.json();
        cachedProducts = all;
        p = cachedProducts.find(item => item.id === productId);
      } catch (e) {}
    }
    if (!p) return showToast('Produto não encontrado.', 'error');

    const effectiveClientId = p.client_id || targetClientId || null;
    await populateProductClientSelect(effectiveClientId);

    if (idInput) idInput.value = p.id;
    document.getElementById('prod-code').value = p.code || '';
    document.getElementById('prod-name').value = p.name || '';
    if (document.getElementById('prod-order-number')) document.getElementById('prod-order-number').value = p.order_number || '';
    document.getElementById('prod-stock-qty').value = p.stock_qty !== undefined && p.stock_qty !== null ? p.stock_qty : 0;
    document.getElementById('prod-description').value = p.description || '';
    document.getElementById('prod-image-url').value = p.image_url || '';

    if (previewContainer && previewImg && p.image_url) {
      previewImg.src = p.image_url;
      previewContainer.style.display = 'flex';
    }

    document.getElementById('prod-unit-weight').value = p.unit_weight !== undefined ? p.unit_weight : p.unit_weight_kg || 0;
    document.getElementById('prod-unit-height').value = p.unit_height !== undefined ? p.unit_height : p.unit_height_cm || 0;
    document.getElementById('prod-unit-width').value = p.unit_width !== undefined ? p.unit_width : p.unit_width_cm || 0;
    document.getElementById('prod-unit-length').value = p.unit_length !== undefined ? p.unit_length : p.unit_length_cm || 0;

    document.getElementById('prod-max-qty').value = p.max_qty_per_box || 1;
    document.getElementById('prod-box-weight').value = p.box_weight !== undefined ? p.box_weight : p.box_empty_weight_kg || 0.5;
    document.getElementById('prod-box-height').value = p.box_height !== undefined ? p.box_height : p.box_height_cm || 30;
    document.getElementById('prod-box-width').value = p.box_width !== undefined ? p.box_width : p.box_width_cm || 40;
    document.getElementById('prod-box-length').value = p.box_length !== undefined ? p.box_length : p.box_length_cm || 40;

    if (titleEl) titleEl.textContent = 'Editar Produto & Regra Logística';
    if (subtitleEl) subtitleEl.textContent = `Ajustando dimensões e regras de embalagem do produto: ${p.name} (${p.code})`;
  } else {
    // MODO NOVO PRODUTO
    const defaultClientId = targetClientId || activeManagingClientId || null;
    await populateProductClientSelect(defaultClientId);
    if (defaultClientId) {
      form.dataset.targetClientId = defaultClientId;
    } else {
      delete form.dataset.targetClientId;
    }

    if (document.getElementById('prod-stock-qty')) document.getElementById('prod-stock-qty').value = '100';
    if (document.getElementById('prod-box-weight')) document.getElementById('prod-box-weight').value = '0.500';
    if (document.getElementById('prod-box-height')) document.getElementById('prod-box-height').value = '30';
    if (document.getElementById('prod-box-width')) document.getElementById('prod-box-width').value = '40';
    if (document.getElementById('prod-box-length')) document.getElementById('prod-box-length').value = '40';

    if (titleEl) titleEl.textContent = targetClientId ? 'Cadastrar Produto para este Cliente' : 'Cadastrar Novo Produto & Regra Logística';
    if (subtitleEl) subtitleEl.textContent = 'Cadastre as dimensões unitárias e regras de caixas/embalagens para cálculo automático de frete e cubagem.';
  }

  switchTab('page-product-form');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeProductForm() {
  if (productFormReturnTab === 'page-client-detail' && productFormReturnClientId) {
    if (typeof openClientDetailPage === 'function') {
      openClientDetailPage(productFormReturnClientId);
    } else {
      switchTab('page-client-detail');
    }
  } else {
    switchTab('tab-products');
  }
}

async function editProduct(productId) {
  openProductForm(productId);
}

window.openProductForm = openProductForm;
window.closeProductForm = closeProductForm;
window.editProduct = editProduct;

async function deleteProduct(productId) {
  if (!confirm('Tem certeza que deseja excluir este produto?')) return;

  try {
    const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
    if (!res.ok) {
      const errData = await res.json();
      showToast('Erro ao excluir produto: ' + (errData.error || 'Falha no servidor'), 'error');
      return;
    }
    showToast('Produto excluído com sucesso!', 'success');
    await loadProducts();
  } catch (err) {
    showToast('Erro de conexão ao excluir produto.', 'error');
  }
}

function openModal(id) {
  // Fechar outros modais antes de abrir o novo para evitar sobreposição
  closeAllModals();
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function closeModal(id) {
  if (id) {
    document.getElementById(id)?.classList.add('hidden');
  } else {
    closeAllModals();
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.classList.add('hidden');
  });
}

// Global Event Listeners para Fechar Modais (ESC key + Clicar no Fundo Escuro)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllModals();
  }
});

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    closeAllModals();
  }
});

function showPackagesSummaryModal(pkgData) {
  const container = document.getElementById('packages-summary-content');
  container.innerHTML = `
    <div style="margin-bottom: 1rem; background: var(--primary-light); padding: 1rem; border-radius: 8px; color: var(--primary-text);">
      <strong>Total de Volumes (Caixas):</strong> ${pkgData.total_packages} volume(s)<br>
      <strong>Peso Total da Remessa:</strong> ${pkgData.total_weight_kg.toFixed(3)} kg
    </div>

    <h4 style="margin-bottom: 0.5rem;">Detalhamento das Embalagens Padrão:</h4>
    ${pkgData.packages.map((pkg, idx) => `
      <div style="border: 1px solid var(--border-color); border-radius: 8px; padding: 0.85rem; margin-bottom: 0.5rem; font-size: 0.88rem;">
        <strong>Volume #${idx + 1}:</strong> Caixa ${pkg.length_cm}x${pkg.width_cm}x${pkg.height_cm} cm | Peso: <strong>${pkg.weight_kg.toFixed(3)} kg</strong>
      </div>
    `).join('')}
  `;
  openModal('modal-packages-summary');
}

/* ==========================================================================
   7. GESTÃO DE MEUS ENDEREÇOS
   ========================================================================== */
let cachedAddresses = [];

async function loadAddresses() {
  const container = document.getElementById('addresses-cards-container');
  if (!container) return;

  try {
    const res = await fetch('/api/addresses');
    const data = await res.json();
    cachedAddresses = data.addresses || [];
    window.cachedAddresses = cachedAddresses;

    renderAddressesCards(cachedAddresses);
  } catch (err) {
    console.error('Erro ao carregar endereços:', err);
  }
}

function renderAddressesCards(addresses) {
  const container = document.getElementById('addresses-cards-container');
  if (!container) return;

  if (!addresses || addresses.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 3rem 1.5rem;">
        <h3 style="color: var(--text-primary); font-weight: 700; margin-bottom: 0.25rem;">Nenhum endereço cadastrado ainda</h3>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 1.25rem;">Cadastre seus endereços de entrega frequentes para agilizar o envio dos seus pedidos.</p>
        <button class="btn btn-primary" onclick="openAddressFormModal()">Cadastrar Primeiro Endereço</button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="addresses-list">
      ${addresses.map(addr => `
        <div class="address-list-item">
          <div class="address-list-info">
            <div class="address-list-header">
              <span class="address-list-title">${addr.title || 'Endereço'}</span>
              ${addr.recipient_name ? `<span class="address-list-badge-recipient">${addr.recipient_name}</span>` : ''}
              ${addr.cep ? `<span class="address-list-badge-cep">CEP: ${addr.cep}</span>` : ''}
            </div>
            <div class="address-list-details">
              ${addr.address || ''}${addr.number ? ', nº ' + addr.number : ''} ${addr.complement ? '(' + addr.complement + ')' : ''} ${addr.neighborhood ? '— Bairro ' + addr.neighborhood + ' — ' : '— '}${addr.city || ''} / ${addr.state || ''}
            </div>
          </div>
          <div class="address-list-actions">
            <button class="btn btn-success btn-sm" onclick="useAddressForShipment(${addr.id})" title="Usar este endereço no envio">Usar para Envio</button>
            <button class="btn btn-secondary btn-sm" onclick="openAddressFormModal(${addr.id})" title="Editar Endereço">Editar</button>
            <button class="btn btn-danger btn-sm" onclick="deleteAddress(event, ${addr.id})" title="Excluir Endereço">Excluir</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function openAddressFormModal(addressId = null) {
  const form = document.getElementById('form-address-edit');
  if (form) form.reset();

  document.getElementById('address-id').value = '';
  document.getElementById('address-form-modal-title').textContent = 'Cadastrar Novo Endereço';

  if (addressId) {
    const addr = cachedAddresses.find(a => a.id === addressId);
    if (addr) {
      document.getElementById('address-id').value = addr.id;
      document.getElementById('addr-title').value = addr.title || '';
      document.getElementById('addr-recipient').value = addr.recipient_name || '';
      document.getElementById('addr-cep').value = addr.cep || '';
      document.getElementById('addr-street').value = addr.address || '';
      document.getElementById('addr-number').value = addr.number || '';
      document.getElementById('addr-bairro').value = addr.neighborhood || '';
      document.getElementById('addr-city').value = addr.city || '';
      document.getElementById('addr-uf').value = addr.state || '';
      document.getElementById('addr-complement').value = addr.complement || '';
      document.getElementById('address-form-modal-title').textContent = 'Editar Endereço';
    }
  }

  openModal('modal-address-form');
}

async function saveAddressForm(e) {
  if (e) e.preventDefault();

  const id = document.getElementById('address-id').value;
  const targetClientId = (currentAuthUser && currentAuthUser.role === 'client') ? currentAuthUser.id : null;
  const payload = {
    client_id: targetClientId,
    title: document.getElementById('addr-title').value.trim(),
    recipient_name: document.getElementById('addr-recipient').value.trim(),
    cep: document.getElementById('addr-cep').value.trim(),
    address: document.getElementById('addr-street').value.trim(),
    number: document.getElementById('addr-number').value.trim(),
    neighborhood: document.getElementById('addr-bairro').value.trim(),
    city: document.getElementById('addr-city').value.trim(),
    state: document.getElementById('addr-uf').value.trim(),
    complement: document.getElementById('addr-complement').value.trim()
  };

  if (!payload.title || !payload.cep) {
    showToast('Apelido e CEP são obrigatórios!', 'error');
    return;
  }

  try {
    const url = id ? `/api/addresses/${id}` : '/api/addresses';
    const method = id ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const contentType = res.headers.get('content-type');
    let data = {};
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    }

    if (!res.ok) {
      showToast('Erro ao salvar: ' + (data.error || 'Falha na requisição ao servidor'), 'error');
      return;
    }

    closeModal('modal-address-form');
    showToast(id ? 'Endereço atualizado com sucesso!' : 'Novo endereço cadastrado com sucesso!', 'success');
    await loadAddresses();
  } catch (err) {
    showToast('Erro ao salvar endereço: ' + err.message, 'error');
  }
}

async function deleteAddress(eventOrId, addressIdParam) {
  let addressId = addressIdParam;
  if (typeof eventOrId === 'number') {
    addressId = eventOrId;
  } else if (eventOrId && eventOrId.stopPropagation) {
    eventOrId.stopPropagation();
  }

  if (!addressId) return;

  if (!confirm('Deseja realmente excluir este endereço cadastrado?')) return;

  try {
    const res = await fetch(`/api/addresses/${addressId}`, { method: 'DELETE' });
    const contentType = res.headers.get('content-type');
    let data = {};
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    }

    if (!res.ok) {
      showToast('Erro ao excluir endereço: ' + (data.error || 'Falha na requisição'), 'error');
      return;
    }

    showToast('Endereço excluído com sucesso!', 'success');
    await loadAddresses();
  } catch (err) {
    showToast('Erro de comunicação ao excluir endereço: ' + err.message, 'error');
  }
}

async function openSelectSavedAddressModal() {
  if (!cachedAddresses || cachedAddresses.length === 0) {
    await loadAddresses();
  }

  const listContainer = document.getElementById('modal-select-address-list');
  if (!listContainer) return;

  if (!cachedAddresses || cachedAddresses.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
        Você ainda não possui endereços cadastrados.<br>
        Clique abaixo em <strong>"Novo Endereço"</strong> para cadastrar o primeiro!
      </div>
    `;
  } else {
    listContainer.innerHTML = cachedAddresses.map(addr => `
      <div class="address-select-item" onclick="selectSavedAddress(${addr.id})">
        <div>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${addr.title || 'Endereço'}</div>
          <div style="font-size: 0.82rem; color: #475569; margin-top: 0.2rem;">
            <strong>${addr.recipient_name || ''}</strong> — ${addr.address || ''}, nº ${addr.number || ''} (${addr.city || ''} - ${addr.state || ''})
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.1rem;">CEP: ${addr.cep || ''}</div>
        </div>
        <button class="btn btn-primary btn-sm" style="white-space: nowrap;">Selecionar</button>
      </div>
    `).join('');
  }

  openModal('modal-select-address');
}

function selectSavedAddress(addressId) {
  const addr = cachedAddresses.find(a => a.id === addressId);
  if (!addr) return;

  // Preencher CEP no campo de cotação
  const cepInput = document.getElementById('input-dest-cep');
  if (cepInput) cepInput.value = addr.cep || '';

  // Preencher os dados de endereço na Fase 2
  const nameInput = document.getElementById('final-input-name');
  const streetInput = document.getElementById('final-input-street');
  const numberInput = document.getElementById('final-input-number');
  const bairroInput = document.getElementById('final-input-bairro');
  const cityInput = document.getElementById('final-input-city');
  const ufInput = document.getElementById('final-input-uf');
  const complementInput = document.getElementById('final-input-complement');

  if (nameInput) nameInput.value = addr.recipient_name || '';
  if (streetInput) streetInput.value = addr.address || '';
  if (numberInput) numberInput.value = addr.number || '';
  if (bairroInput) bairroInput.value = addr.neighborhood || '';
  if (cityInput) cityInput.value = addr.city || '';
  if (ufInput) ufInput.value = addr.state || '';
  if (complementInput) complementInput.value = addr.complement || '';

  closeModal('modal-select-address');
  showToast(`Endereço <strong>"${addr.title}"</strong> selecionado e preenchido!`, 'success');
}

function useAddressForShipment(addressId) {
  switchTab('tab-cart');
  selectSavedAddress(addressId);
  // Focar na cotação de frete
  const cepInput = document.getElementById('input-dest-cep');
  if (cepInput) cepInput.focus();
}

async function fetchViaCEPAux(cep, streetId, bairroId, cityId, ufId) {
  const cleanCep = (cep || '').replace(/\D/g, '');
  if (cleanCep.length !== 8) return;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.erro) return;

    if (data.logradouro && document.getElementById(streetId)) document.getElementById(streetId).value = data.logradouro;
    if (data.bairro && document.getElementById(bairroId)) document.getElementById(bairroId).value = data.bairro;
    if (data.localidade && document.getElementById(cityId)) document.getElementById(cityId).value = data.localidade;
    if (data.uf && document.getElementById(ufId)) document.getElementById(ufId).value = data.uf;
  } catch (err) {
    console.warn('Erro ao consultar ViaCEP:', err);
  }
}

/* ==========================================================================
   CARTEIRA & CONTROLE DE FATURAMENTO
   ========================================================================== */

let windowBillingShipments = [];

async function loadBillingData() {
  try {
    // 1. Carregar resumo financeiro
    const summaryRes = await fetch('/api/billing/summary');
    if (summaryRes.ok) {
      const summary = await summaryRes.json();
      const openEl = document.getElementById('billing-total-open');
      const paidEl = document.getElementById('billing-total-paid');
      if (openEl) openEl.textContent = `R$ ${parseFloat(summary.total_em_aberto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (paidEl) paidEl.textContent = `R$ ${parseFloat(summary.total_pago || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // 2. Carregar extrato de envios
    const shipmentsRes = await fetch('/api/billing/shipments');
    if (shipmentsRes.ok) {
      windowBillingShipments = await shipmentsRes.json();
      renderBillingShipmentsTable(windowBillingShipments);
    }
  } catch (err) {
    console.error('Erro ao carregar dados da carteira:', err);
  }
}

function renderBillingShipmentsTable(shipments) {
  const tbody = document.getElementById('billing-shipments-tbody');
  if (!tbody) return;

  const selectAllCb = document.getElementById('billing-select-all');
  if (selectAllCb) selectAllCb.checked = false;
  updateSelectedBillingCount();

  if (!shipments || shipments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum lançamento financeiro registrado.</td></tr>`;
    return;
  }

  const isAdmin = currentRole === 'admin';

  // Garantir visibilidade dos elementos admin-only apenas dentro da Carteira (sem afetar abas/páginas)
  document.querySelectorAll('#tab-billing .admin-only').forEach(el => {
    if (!el.classList.contains('tab-page')) {
      if (isAdmin) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });

  tbody.innerHTML = shipments.map(s => {
    const isPaid = s.payment_status === 'pago';

    // Valor
    const priceFormatted = `R$ ${parseFloat(s.final_freight_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const valueHTML = `<strong style="color: ${isPaid ? '#16a34a' : '#dc2626'}; font-size: 0.88rem;">${priceFormatted}</strong>`;

    // Pedido / Remessa (Clicável para abrir modal Ver Detalhes)
    const orderHTML = `
      <button type="button" onclick="openShipmentDetailModal(${s.id})" 
              style="background: none; border: none; padding: 0; color: #4f46e5; font-weight: 700; font-family: monospace; font-size: 0.88rem; text-decoration: underline; cursor: pointer;" 
              title="Clique para ver os detalhes da remessa e produtos">
        ${s.code}
      </button>
    `;

    // Data
    const formattedDate = new Date(s.created_at).toLocaleDateString('pt-BR');

    // Observações / Destino
    const obsText = `Envio de remessa — ${s.recipient_name || 'Destinatário'} (${s.dest_city || ''}/${s.dest_state || ''})`;

    // Checkbox Admin
    const checkboxHTML = isAdmin
      ? `<td style="text-align: center; padding: 0.75rem 0.5rem;">
           <input type="checkbox" class="billing-item-checkbox" data-id="${s.id}" onchange="updateSelectedBillingCount()" style="cursor: pointer;">
         </td>`
      : ``;

    // Status Pagamento (Bolinha de status + Botão direto para Dar Baixa ou Reabrir)
    const statusDotColor = isPaid ? '#22c55e' : '#ef4444';

    const statusCellHTML = isAdmin
      ? `<div style="display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;">
           <span title="${isPaid ? 'Quitado' : 'Em Aberto'}" style="width: 10px; height: 10px; border-radius: 50%; background-color: ${statusDotColor}; display: inline-block; flex-shrink: 0;"></span>
           <span style="font-size: 0.8rem; font-weight: 700; color: ${isPaid ? '#15803d' : '#dc2626'};">${isPaid ? 'Pago' : 'Em Aberto'}</span>
           ${!isPaid 
             ? `<button type="button" onclick="setShipmentPaymentStatus(${s.id}, 'pago')" class="btn btn-sm" style="background: #16a34a; color: #fff; font-size: 0.74rem; font-weight: 700; padding: 3px 9px; border: none; border-radius: 5px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); transition: all 0.15s ease;" onmouseover="this.style.background='#15803d'" onmouseout="this.style.background='#16a34a'" title="Dar baixa neste pedido">Dar Baixa</button>` 
             : `<button type="button" onclick="setShipmentPaymentStatus(${s.id}, 'em_aberto')" class="btn btn-sm" style="background: #f8fafc; color: #64748b; font-size: 0.74rem; padding: 3px 8px; border: 1px solid #cbd5e1; border-radius: 5px; cursor: pointer; transition: all 0.15s ease;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'" title="Reverter para Em Aberto">Reabrir</button>`}
           <button type="button" onclick="deleteBillingShipment(${s.id}, '${s.code}')" class="btn btn-sm" style="background: #fff; color: #ef4444; border: 1px solid #fecaca; font-size: 0.72rem; padding: 3px 6px; border-radius: 5px; cursor: pointer; margin-left: 2px;" title="Excluir este lançamento">Excluir</button>
         </div>`
      : (isPaid
          ? `<span style="display: inline-flex; align-items: center; gap: 0.35rem; color: #15803d; font-weight: 600;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #22c55e;"></span> Pago</span>`
          : `<span style="display: inline-flex; align-items: center; gap: 0.35rem; color: #dc2626; font-weight: 600;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span> Em Aberto</span>`
        );

    return `
      <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
        ${checkboxHTML}
        <td style="padding: 0.75rem 1rem; color: #475569;">${formattedDate}</td>
        <td style="padding: 0.75rem 1rem;">${valueHTML}</td>
        <td style="padding: 0.75rem 1rem;">${orderHTML}</td>
        <td style="padding: 0.75rem 1rem; color: #64748b; font-size: 0.8rem;">${obsText}</td>
        <td style="padding: 0.75rem 1rem;">${statusCellHTML}</td>
      </tr>
    `;
  }).join('');
}

function toggleSelectAllBillingShipments(checked) {
  const checkboxes = document.querySelectorAll('.billing-item-checkbox');
  checkboxes.forEach(cb => cb.checked = checked);
  updateSelectedBillingCount();
}

function updateSelectedBillingCount() {
  const selected = document.querySelectorAll('.billing-item-checkbox:checked');
  const countEl = document.getElementById('billing-selected-count');
  const batchBar = document.getElementById('billing-batch-bar');

  if (countEl) countEl.textContent = selected.length;
  if (batchBar) {
    batchBar.style.display = selected.length > 0 ? 'inline-flex' : 'none';
  }
}

function getSelectedBillingShipmentIds() {
  const selected = document.querySelectorAll('.billing-item-checkbox:checked');
  return Array.from(selected).map(cb => parseInt(cb.getAttribute('data-id'), 10));
}

async function batchSetPaymentStatus(targetStatus) {
  const ids = getSelectedBillingShipmentIds();
  if (ids.length === 0) {
    showToast('Selecione pelo menos um pedido para dar baixa.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/billing/shipments/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipment_ids: ids, payment_status: targetStatus })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast('Erro: ' + (data.error || 'Não foi possível atualizar'), 'error');
      return;
    }

    showToast(`${data.message}`, 'success');
    await loadBillingData();
    if (activeManagingClientId) {
      await loadClientBilling(activeManagingClientId);
    }
    if (typeof loadClients === 'function') {
      await loadClients();
    }
  } catch (err) {
    showToast('Erro ao comunicar com o servidor.', 'error');
  }
}

async function setShipmentPaymentStatus(shipmentId, targetStatus) {
  try {
    const res = await fetch('/api/billing/shipments/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipment_ids: [shipmentId], payment_status: targetStatus })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast('Erro: ' + (data.error || 'Não foi possível atualizar'), 'error');
      return;
    }

    showToast(targetStatus === 'pago' ? 'Baixa efetuada com sucesso!' : 'Lançamento marcado como Em Aberto!', 'success');
    await loadBillingData();
    if (activeManagingClientId) {
      await loadClientBilling(activeManagingClientId);
    }
    if (typeof loadClients === 'function') {
      await loadClients();
    }
  } catch (err) {
    showToast('Erro de conexão ao alterar status: ' + err.message, 'error');
  }
}
window.setShipmentPaymentStatus = setShipmentPaymentStatus;
window.singleSetPaymentStatus = setShipmentPaymentStatus;

async function deleteBillingShipment(shipmentId, code) {
  if (!confirm(`Deseja realmente excluir a cobrança/lançamento ${code || ''}? Esta ação removerá a cobrança do sistema.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/shipments/${shipmentId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Erro ao excluir cobrança', 'error');
      return;
    }
    showToast('Cobrança excluída com sucesso!', 'success');
    await loadBillingData();
    if (activeManagingClientId) await loadClientBilling(activeManagingClientId);
    if (typeof loadClients === 'function') await loadClients();
    if (typeof loadShipments === 'function') await loadShipments();
  } catch (err) {
    showToast('Erro ao comunicar com o servidor: ' + err.message, 'error');
  }
}
window.deleteBillingShipment = deleteBillingShipment;

async function batchDeleteBillingShipments() {
  const ids = getSelectedBillingShipmentIds();
  if (ids.length === 0) {
    showToast('Selecione pelo menos um lançamento para excluir.', 'warning');
    return;
  }

  if (!confirm(`Deseja realmente excluir os ${ids.length} lançamentos selecionados?`)) {
    return;
  }

  try {
    const res = await fetch('/api/billing/shipments/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipment_ids: ids })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Erro ao excluir lançamentos', 'error');
      return;
    }

    showToast(data.message || 'Lançamentos excluídos com sucesso!', 'success');
    await loadBillingData();
    if (activeManagingClientId) await loadClientBilling(activeManagingClientId);
    if (typeof loadClients === 'function') await loadClients();
    if (typeof loadShipments === 'function') await loadShipments();
  } catch (err) {
    showToast('Erro ao comunicar com o servidor: ' + err.message, 'error');
  }
}
window.batchDeleteBillingShipments = batchDeleteBillingShipments;

function togglePaymentMenu(event, shipmentId, currentStatus) {
  event.stopPropagation();
  const existingMenu = document.getElementById('payment-dropdown-menu');
  if (existingMenu) {
    const isSame = existingMenu.getAttribute('data-id') == shipmentId;
    existingMenu.remove();
    if (isSame) return;
  }

  const button = event.currentTarget;
  const rect = button.getBoundingClientRect();
  const isPaid = currentStatus === 'pago';
  const newStatus = isPaid ? 'em_aberto' : 'pago';
  const actionLabel = isPaid ? 'Marcar como Em Aberto' : 'Confirmar Pagamento';

  const menu = document.createElement('div');
  menu.id = 'payment-dropdown-menu';
  menu.setAttribute('data-id', shipmentId);
  menu.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 6}px;
    left: ${Math.min(rect.left - 40, window.innerWidth - 190)}px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    border-radius: 10px;
    padding: 6px;
    z-index: 9999;
    min-width: 180px;
  `;

  menu.innerHTML = `
    <button type="button" onclick="confirmPaymentStatusChange(${shipmentId}, '${newStatus}')" 
            style="width: 100%; text-align: left; padding: 8px 12px; background: none; border: none; font-size: 0.83rem; font-weight: 600; color: #1e293b; cursor: pointer; border-radius: 6px; display: flex; align-items: center; gap: 8px; transition: background 0.15s ease;"
            onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='none'">
      ${actionLabel}
    </button>
  `;

  document.body.appendChild(menu);

  const closeListener = (e) => {
    if (!menu.contains(e.target) && e.target !== button && !button.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeListener);
    }
  };
  setTimeout(() => document.addEventListener('click', closeListener), 10);
}

async function confirmPaymentStatusChange(shipmentId, targetStatus) {
  const menu = document.getElementById('payment-dropdown-menu');
  if (menu) menu.remove();

  await singleSetPaymentStatus(shipmentId, targetStatus);
}

/* ==========================================================================
   10. GESTÃO DE CLIENTES & MULTI-TENANCY (ADMIN HUB)
   ========================================================================== */

let clientsList = [];
let activeManagingClientId = null;

async function loadClients() {
  try {
    const res = await fetch('/api/clients');
    if (!res.ok) throw new Error('Erro ao buscar clientes');
    clientsList = await res.json();
    renderClientsTable(clientsList);
    if (typeof populateShipmentClientFilter === 'function') {
      populateShipmentClientFilter(window.allDetailedShipments || []);
    }
  } catch (err) {
    console.error('Erro ao carregar clientes:', err);
  }
}

function renderClientsTable(clients) {
  const tbody = document.getElementById('clients-table-body');
  if (!tbody) return;

  if (!clients || clients.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-muted);">
          Nenhum cliente cadastrado até o momento. Clique em <strong>"+ Adicionar Cliente"</strong>.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = clients.map(client => `
    <tr>
      <td style="font-weight: 700;">${escapeHtml(client.name)}</td>
      <td style="font-size: 0.82rem; color: var(--text-secondary);">${escapeHtml(client.cnpj_cpf || client.cnpj || 'Não informado')}</td>
      <td style="font-size: 0.82rem;">${escapeHtml(client.email)}</td>
      <td style="font-size: 0.82rem;">${escapeHtml(client.phone || '-')}</td>
      <td><span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 700;">${client.total_products || 0} prod.</span></td>
      <td><span class="badge" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; font-weight: 700;">${client.total_shipments || 0} envios</span></td>
      <td style="font-weight: 700; color: ${(client.open_balance ?? client.total_open ?? 0) > 0 ? '#ef4444' : 'var(--text-muted)'};">
        R$ ${parseFloat(client.open_balance ?? client.total_open ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </td>
      <td style="font-weight: 700; color: #22c55e;">
        R$ ${parseFloat(client.paid_balance ?? client.total_paid ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openClientDetailPage(${client.id})" style="padding: 0.3rem 0.6rem; font-size: 0.78rem;">
          Gerenciar Cliente
        </button>
        <button class="btn btn-secondary btn-sm" onclick="deleteClientAccount(${client.id}, '${escapeHtml(client.name)}')" style="padding: 0.3rem 0.5rem; font-size: 0.78rem; color: #ef4444;" title="Excluir Cliente">
          Excluir
        </button>
      </td>
    </tr>
  `).join('');
}

function openAddClientPage() {
  const form = document.getElementById('form-add-client');
  if (form) form.reset();
  switchTab('page-add-client');
}
window.openAddClientPage = openAddClientPage;
window.openAddClientModal = openAddClientPage;

function closeAddClientPage() {
  switchTab('tab-clients');
}
window.closeAddClientPage = closeAddClientPage;

async function submitAddClient(event) {
  event.preventDefault();
  const name = document.getElementById('client-name').value.trim();
  const email = document.getElementById('client-email').value.trim();
  const password = document.getElementById('client-password').value;
  const cnpj = document.getElementById('client-cnpj').value.trim();
  const phone = document.getElementById('client-phone').value.trim();
  const btnSave = document.getElementById('btn-save-client');

  if (btnSave) {
    btnSave.disabled = true;
    btnSave.innerText = 'Salvando...';
  }

  try {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, cnpj, cnpj_cpf: cnpj, phone })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar cliente.');

    showToast('Cliente cadastrado com sucesso!');
    await loadClients();
    closeAddClientPage();
  } catch (err) {
    alert(err.message);
  } finally {
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerText = 'Cadastrar Cliente';
    }
  }
}
window.submitAddClient = submitAddClient;

async function openClientDetailPage(clientId) {
  activeManagingClientId = clientId;
  let client = clientsList.find(c => c.id === clientId);
  if (!client) {
    try {
      const res = await fetch(`/api/clients/${clientId}`);
      if (res.ok) client = await res.json();
    } catch (e) {
      console.error(e);
    }
  }
  if (!client) return;

  const clientCnpj = client.cnpj_cpf || client.cnpj || '';
  const nameEl = document.getElementById('manage-client-name');
  const subEl = document.getElementById('manage-client-subtitle');
  if (nameEl) nameEl.innerText = `Gerenciar Cliente: ${client.name}`;
  if (subEl) subEl.innerText = `CNPJ/CPF: ${clientCnpj || 'Não informado'} | E-mail: ${client.email} | Telefone: ${client.phone || 'Não informado'}`;

  document.getElementById('edit-client-id').value = client.id;
  document.getElementById('edit-client-name').value = client.name;
  document.getElementById('edit-client-email').value = client.email;
  document.getElementById('edit-client-cnpj').value = clientCnpj;
  document.getElementById('edit-client-phone').value = client.phone || '';
  document.getElementById('edit-client-password').value = '';

  switchClientDetailTab('products');
  switchTab('page-client-detail');

  loadClientProducts(clientId);
  loadClientBilling(clientId);
}
window.openClientDetailPage = openClientDetailPage;
window.openManageClientModal = openClientDetailPage;

function switchClientDetailTab(tabName) {
  const tabs = ['products', 'billing', 'info'];
  tabs.forEach(t => {
    const btn = document.getElementById(`btn-client-tab-${t}`);
    const content = document.getElementById(`client-subtab-${t}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (content) content.classList.toggle('hidden', t !== tabName);
  });
  if (tabName === 'billing' && activeManagingClientId) {
    loadClientBilling(activeManagingClientId);
  }
}

async function loadClientProducts(clientId) {
  const tbody = document.getElementById('client-products-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Carregando produtos...</td></tr>';

  try {
    const res = await fetch(`/api/products?client_id=${clientId}`);
    const prods = await res.json();

    if (!prods || prods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Nenhum produto cadastrado para este cliente.</td></tr>';
      return;
    }

    tbody.innerHTML = prods.map(p => `
      <tr>
        <td style="font-weight: 700;">${escapeHtml(p.code)}</td>
        <td>${escapeHtml(p.name)}</td>
        <td><span class="badge badge-success">${p.stock_qty || 0} un</span></td>
        <td>${p.unit_weight || 0} kg</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="editProduct(${p.id})">Editar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color: #ef4444;">Erro ao carregar produtos.</td></tr>`;
  }
}

async function loadClientBilling(clientId) {
  const tbody = document.getElementById('client-shipments-tbody');
  const openBalEl = document.getElementById('client-open-balance');
  const paidBalEl = document.getElementById('client-paid-balance');

  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 1.5rem;">Carregando carteira...</td></tr>';

  try {
    const [summaryRes, shipmentsRes] = await Promise.all([
      fetch(`/api/billing/summary?client_id=${clientId}`),
      fetch(`/api/billing/shipments?client_id=${clientId}`)
    ]);

    const summary = await summaryRes.json();
    const shipments = await shipmentsRes.json();

    if (openBalEl) openBalEl.innerText = `R$ ${parseFloat(summary.total_em_aberto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (paidBalEl) paidBalEl.innerText = `R$ ${parseFloat(summary.total_pago || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    const selectAllCb = document.getElementById('client-billing-select-all');
    if (selectAllCb) selectAllCb.checked = false;
    updateSelectedClientBillingCount();

    if (!shipments || shipments.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhuma remessa registrada para este cliente.</td></tr>';
      return;
    }

    if (tbody) {
      tbody.innerHTML = shipments.map(s => {
        const isPaid = s.payment_status === 'pago';
        const formattedDate = s.created_at ? new Date(s.created_at).toLocaleDateString('pt-BR') : '-';
        const priceFormatted = `R$ ${parseFloat(s.final_freight_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        return `
          <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
            <td style="text-align: center; padding: 0.75rem 0.5rem;">
              <input type="checkbox" class="client-billing-item-checkbox" data-id="${s.id}" onchange="updateSelectedClientBillingCount()" style="cursor: pointer;">
            </td>
            <td style="font-weight: 700; font-family: monospace; padding: 0.75rem 1rem;">
              <button type="button" onclick="openShipmentDetailModal(${s.id})" 
                      style="background: none; border: none; padding: 0; color: #4f46e5; font-weight: 700; font-family: monospace; font-size: 0.85rem; text-decoration: underline; cursor: pointer;"
                      title="Ver detalhes desta remessa">
                ${escapeHtml(s.code)}
              </button>
            </td>
            <td style="padding: 0.75rem 1rem; color: #64748b; font-size: 0.82rem;">${formattedDate}</td>
            <td style="padding: 0.75rem 1rem; color: #334155;">${escapeHtml(s.dest_city || '')} / ${escapeHtml(s.dest_state || '')}</td>
            <td style="padding: 0.75rem 1rem; font-weight: 700; color: ${isPaid ? '#16a34a' : '#dc2626'};">${priceFormatted}</td>
            <td style="padding: 0.75rem 1rem;">
              ${isPaid 
                ? '<span class="badge" style="background: #dcfce7; color: #166534; font-weight: 700; padding: 3px 8px; border-radius: 6px; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 7px; height: 7px; border-radius: 50%; background: #22c55e;"></span> Pago</span>' 
                : '<span class="badge" style="background: #fee2e2; color: #991b1b; font-weight: 700; padding: 3px 8px; border-radius: 6px; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 4px;"><span style="width: 7px; height: 7px; border-radius: 50%; background: #ef4444;"></span> Em Aberto</span>'}
            </td>
            <td style="padding: 0.75rem 1rem; text-align: center;">
              ${!isPaid
                ? `<button type="button" class="btn btn-sm" onclick="setShipmentPaymentStatus(${s.id}, 'pago')" 
                           style="background: #16a34a; color: #ffffff; border: none; padding: 0.4rem 0.85rem; border-radius: 6px; font-weight: 700; font-size: 0.78rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); transition: all 0.15s ease;"
                           onmouseover="this.style.background='#15803d'" onmouseout="this.style.background='#16a34a'"
                           title="Dar baixa e marcar como pago">
                     Dar Baixa
                   </button>`
                : `<button type="button" class="btn btn-sm" onclick="setShipmentPaymentStatus(${s.id}, 'em_aberto')" 
                           style="background: #f8fafc; color: #64748b; border: 1px solid #cbd5e1; padding: 0.35rem 0.75rem; border-radius: 6px; font-weight: 600; font-size: 0.75rem; cursor: pointer; transition: all 0.15s ease;"
                           onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'"
                           title="Reverter para Em Aberto">
                     Reabrir
                   </button>`}
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; padding: 1.5rem;">Erro ao carregar carteira.</td></tr>`;
  }
}

function toggleSelectAllClientBilling(checked) {
  const checkboxes = document.querySelectorAll('.client-billing-item-checkbox');
  checkboxes.forEach(cb => cb.checked = checked);
  updateSelectedClientBillingCount();
}
window.toggleSelectAllClientBilling = toggleSelectAllClientBilling;

function updateSelectedClientBillingCount() {
  const selected = document.querySelectorAll('.client-billing-item-checkbox:checked');
  const countEl = document.getElementById('client-billing-selected-count');
  const batchBar = document.getElementById('client-billing-batch-bar');

  if (countEl) countEl.textContent = selected.length;
  if (batchBar) {
    batchBar.style.display = selected.length > 0 ? 'inline-flex' : 'none';
  }
}
window.updateSelectedClientBillingCount = updateSelectedClientBillingCount;

async function batchSetClientPaymentStatus(targetStatus) {
  const selected = document.querySelectorAll('.client-billing-item-checkbox:checked');
  const ids = Array.from(selected).map(cb => parseInt(cb.getAttribute('data-id'), 10));

  if (ids.length === 0) {
    showToast('Selecione pelo menos um pedido para dar baixa.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/billing/shipments/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipment_ids: ids, payment_status: targetStatus })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast('Erro: ' + (data.error || 'Falha ao processar'), 'error');
      return;
    }

    showToast(`${data.message}`, 'success');

    if (activeManagingClientId) {
      await loadClientBilling(activeManagingClientId);
    }
    if (typeof loadBillingData === 'function') {
      await loadBillingData();
    }
    if (typeof loadClients === 'function') {
      await loadClients();
    }
  } catch (err) {
    showToast('Erro de conexão com o servidor: ' + err.message, 'error');
  }
}
window.batchSetClientPaymentStatus = batchSetClientPaymentStatus;

async function batchDeleteClientBillingShipments() {
  const selected = document.querySelectorAll('.client-billing-item-checkbox:checked');
  const ids = Array.from(selected).map(cb => parseInt(cb.getAttribute('data-id'), 10));

  if (ids.length === 0) {
    showToast('Selecione pelo menos um lançamento para excluir.', 'warning');
    return;
  }

  if (!confirm(`Deseja realmente excluir os ${ids.length} lançamentos deste cliente?`)) {
    return;
  }

  try {
    const res = await fetch('/api/billing/shipments/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipment_ids: ids })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast('Erro: ' + (data.error || 'Falha ao excluir'), 'error');
      return;
    }

    showToast(data.message || 'Lançamentos excluídos com sucesso!', 'success');

    if (activeManagingClientId) {
      await loadClientBilling(activeManagingClientId);
    }
    if (typeof loadBillingData === 'function') {
      await loadBillingData();
    }
    if (typeof loadClients === 'function') {
      await loadClients();
    }
  } catch (err) {
    showToast('Erro de conexão com o servidor: ' + err.message, 'error');
  }
}
window.batchDeleteClientBillingShipments = batchDeleteClientBillingShipments;

function openNewProductForClient() {
  openProductForm(null, activeManagingClientId);
}
window.openNewProductForClient = openNewProductForClient;

async function submitEditClientInfo(event) {
  event.preventDefault();
  const id = document.getElementById('edit-client-id').value;
  const name = document.getElementById('edit-client-name').value.trim();
  const email = document.getElementById('edit-client-email').value.trim();
  const cnpj = document.getElementById('edit-client-cnpj').value.trim();
  const phone = document.getElementById('edit-client-phone').value.trim();
  const password = document.getElementById('edit-client-password').value;

  if (password && password.trim().length > 0 && password.trim().length < 6) {
    showToast('A nova senha deve possuir no mínimo 6 caracteres.', 'error');
    alert('A nova senha deve possuir no mínimo 6 caracteres.');
    return;
  }

  try {
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name, 
        email, 
        cnpj, 
        cnpj_cpf: cnpj, 
        phone, 
        password: password ? password.trim() : undefined 
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar cliente.');

    const passInput = document.getElementById('edit-client-password');
    if (passInput) passInput.value = '';

    const msg = (password && password.trim().length > 0)
      ? 'Dados cadastrais e nova senha do cliente atualizados com sucesso!'
      : 'Dados do cliente atualizados com sucesso!';

    showToast(msg, 'success');
    alert(msg);
    loadClients();
  } catch (err) {
    console.error('Erro ao atualizar cliente:', err);
    showToast(err.message, 'error');
    alert(err.message);
  }
}
window.submitEditClientInfo = submitEditClientInfo;

async function deleteClientAccount(clientId, clientName) {
  if (!confirm(`Tem certeza que deseja excluir o cliente "${clientName}"?\n\nEsta ação é irreversível e excluirá definitivamente:\n- Todos os produtos vinculados a este cliente\n- Todas as remessas e pacotes deste cliente\n- Todos os endereços e faturas da carteira`)) {
    return;
  }

  try {
    const res = await fetch(`/api/clients/${clientId}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao excluir cliente.');
    }

    showToast(data.message || 'Cliente e produtos excluídos com sucesso.');

    // Recarregar listas do sistema
    if (typeof loadClients === 'function') await loadClients();
    if (typeof loadProducts === 'function') await loadProducts();
    if (typeof loadShipments === 'function') await loadShipments();

    // Se estiver na tela de detalhes deste cliente, volta para a listagem de clientes
    const activePage = document.querySelector('.tab-page:not(.hidden)');
    if (activePage && activePage.id === 'page-client-detail') {
      switchTab('tab-clients');
    }
  } catch (err) {
    alert(err.message);
  }
}
window.deleteClientAccount = deleteClientAccount;

function deleteCurrentManagedClient() {
  if (!activeManagingClientId) return;
  const nameInput = document.getElementById('edit-client-name');
  const clientName = (nameInput && nameInput.value) ? nameInput.value.trim() : 'este cliente';
  deleteClientAccount(activeManagingClientId, clientName);
}
window.deleteCurrentManagedClient = deleteCurrentManagedClient;

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    btn.title = "Ocultar senha";
  } else {
    input.type = 'password';
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    btn.title = "Mostrar senha";
  }
}
window.togglePasswordVisibility = togglePasswordVisibility;


