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
  if (typeof loadStoreCart === 'function') loadStoreCart();
  if (currentRole === 'admin' && typeof loadClients === 'function') loadClients();
  if (typeof refreshSystemNotifications === 'function') refreshSystemNotifications();
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

    const flowGroup = document.getElementById('cat-group-flow');
    const storeGroup = document.getElementById('cat-group-store');
    const motherGroup = document.getElementById('cat-group-mother');
    if (flowGroup) flowGroup.classList.remove('hidden');
    if (storeGroup) storeGroup.classList.remove('hidden');
    if (motherGroup) motherGroup.classList.add('hidden');
    document.querySelectorAll('.strip-item[data-tab="tab-my-products"], .strip-item[data-tab="tab-shipments"], .strip-item[data-tab="tab-store-catalog"]').forEach(el => el.classList.remove('hidden'));
  } else {
    if (btnClient) btnClient.classList.add('active');
    if (btnAdmin) btnAdmin.classList.remove('active');
    adminElements.forEach(el => el.classList.add('hidden'));
    clientElements.forEach(el => {
      if (!el.classList.contains('tab-page')) {
        el.classList.remove('hidden');
      }
    });

    const isChildBranch = Boolean(currentAuthUser && currentAuthUser.parent_client_id);
    const canFlow = isChildBranch ? (Number(currentAuthUser.can_access_flow ?? 1) !== 0) : true;
    const canStore = isChildBranch ? (Number(currentAuthUser.can_access_store ?? 1) !== 0) : true;

    const flowGroup = document.getElementById('cat-group-flow');
    const storeGroup = document.getElementById('cat-group-store');
    const motherGroup = document.getElementById('cat-group-mother');

    if (flowGroup) flowGroup.classList.toggle('hidden', !canFlow);
    if (storeGroup) storeGroup.classList.toggle('hidden', !canStore);
    if (motherGroup) motherGroup.classList.toggle('hidden', isChildBranch);

    document.querySelectorAll('.strip-item[data-tab="tab-my-products"], .strip-item[data-tab="tab-shipments"]').forEach(el => el.classList.toggle('hidden', !canFlow));
    document.querySelectorAll('.strip-item[data-tab="tab-store-catalog"]').forEach(el => el.classList.toggle('hidden', !canStore));

    if (!isChildBranch && typeof refreshMotherApprovalsBadge === 'function') {
      refreshMotherApprovalsBadge();
    }

    // Se estiver em uma aba exclusiva de admin ao trocar para cliente, vai para a home
    const activePage = document.querySelector('.tab-page:not(.hidden)');
    if (activePage && (activePage.id === 'tab-products' || activePage.id === 'tab-settings' || activePage.id === 'tab-clients' || activePage.id === 'page-client-detail' || activePage.id === 'page-add-client' || activePage.id === 'page-product-form' || activePage.id === 'tab-admin-store-orders' || activePage.id === 'tab-admin-store-settings' || activePage.id === 'page-store-product-form' || activePage.id === 'page-billing-receive')) {
      switchTab(canFlow ? 'tab-home' : 'tab-store-catalog');
    } else if (!canFlow && activePage && activePage.id === 'tab-home') {
      switchTab('tab-store-catalog');
    }
  }

  // Recarregar/filtrar remessas para mostrar/esconder botões e filtros de admin
  if (typeof filterShipments === 'function') {
    filterShipments();
  } else if (typeof renderShipmentCards === 'function' && window.allDetailedShipments) {
    renderShipmentCards(window.allDetailedShipments);
  }
  if (typeof refreshSystemNotifications === 'function') {
    refreshSystemNotifications();
  }
}

function switchTab(targetTab) {
  const stripItems = document.querySelectorAll('.strip-item[data-tab]');
  const panelItems = document.querySelectorAll('.panel-item[data-tab]');
  const tabPages = document.querySelectorAll('.tab-page');

  let activeNavTab = targetTab;
  if (targetTab === 'page-client-detail' || targetTab === 'page-add-client') activeNavTab = 'tab-clients';
  if (targetTab === 'page-branch-form') activeNavTab = (typeof branchFormReturnTab !== 'undefined' && branchFormReturnTab === 'page-client-detail') ? 'tab-clients' : 'tab-mother-branches';
  if (targetTab === 'page-product-form') activeNavTab = (typeof productFormReturnTab !== 'undefined' && productFormReturnTab === 'page-client-detail') ? 'tab-clients' : 'tab-products';
  if (targetTab === 'page-store-product-form') activeNavTab = (typeof storeProductFormReturnTab !== 'undefined' && storeProductFormReturnTab === 'page-client-detail') ? 'tab-clients' : 'tab-admin-store-settings';
  if (targetTab === 'page-billing-receive') activeNavTab = (typeof receiveBillingReturnTab !== 'undefined' && receiveBillingReturnTab === 'page-client-detail') ? 'tab-clients' : 'tab-billing';
  if (targetTab === 'page-store-product-detail') activeNavTab = 'tab-store-catalog';
  if (targetTab === 'page-store-order-detail') {
    if (typeof storeOrderDetailReturnTab !== 'undefined' && storeOrderDetailReturnTab === 'tab-admin-store-orders') activeNavTab = 'tab-admin-store-orders';
    else if (typeof storeOrderDetailReturnTab !== 'undefined' && storeOrderDetailReturnTab === 'tab-mother-approvals') activeNavTab = 'tab-mother-approvals';
    else if (typeof storeOrderDetailReturnTab !== 'undefined' && storeOrderDetailReturnTab === 'tab-billing') activeNavTab = 'tab-billing';
    else if (typeof storeOrderDetailReturnTab !== 'undefined' && storeOrderDetailReturnTab === 'tab-invoices-nf') activeNavTab = 'tab-invoices-nf';
    else if (typeof storeOrderDetailReturnTab !== 'undefined' && storeOrderDetailReturnTab === 'page-client-detail') activeNavTab = 'tab-clients';
    else activeNavTab = 'tab-store-orders';
  }

  const activeStripTab = (activeNavTab === 'tab-settings') ? 'tab-clients' : activeNavTab;
  stripItems.forEach(s => s.classList.toggle('active', s.getAttribute('data-tab') === activeStripTab));
  panelItems.forEach(p => p.classList.toggle('active', p.getAttribute('data-tab') === activeNavTab));

  if (activeNavTab === 'tab-clients' || activeNavTab === 'tab-settings') {
    const configGroup = document.getElementById('cat-group-config');
    if (configGroup) configGroup.classList.remove('collapsed');
  }

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
    if (typeof loadNetworkBillingOptions === 'function') {
      loadNetworkBillingOptions('flow-checkout-billing-select');
    }
  }
  if (targetTab === 'tab-mother-branches') {
    if (typeof loadMotherBranches === 'function') loadMotherBranches();
  }
  if (targetTab === 'tab-mother-approvals') {
    if (typeof loadMotherApprovals === 'function') loadMotherApprovals();
  }
  if (targetTab === 'tab-addresses') {
    loadAddresses();
  }
  if (targetTab === 'tab-billing') {
    if (currentRole !== 'admin' && typeof markClientDocsAsSeen === 'function') {
      markClientDocsAsSeen('billing', latestClientBillingDocKeys);
      setNavAlertBadge('nav-badge-billing', 'nav-badge-billing-count', 0);
    }
    loadBillingData();
  }
  if (targetTab === 'tab-invoices-nf') {
    if (currentRole !== 'admin' && typeof markClientDocsAsSeen === 'function') {
      markClientDocsAsSeen('nf', latestClientNfDocKeys);
      setNavAlertBadge('nav-badge-invoices-nf', 'nav-badge-invoices-nf-count', 0);
    }
    loadInvoicesNfData();
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
  if (targetTab === 'tab-store-catalog') {
    loadStoreCatalog();
    loadStoreCart();
  }
  if (targetTab === 'tab-store-cart') {
    loadStoreCart();
  }
  if (targetTab === 'tab-store-orders') {
    loadClientStoreOrders();
  }
  if (targetTab === 'tab-store-billing') {
    loadStoreBilling();
  }
  if (targetTab === 'tab-admin-store-orders') {
    loadAdminStoreOrders();
  }
  if (targetTab === 'tab-admin-store-settings') {
    loadAdminStoreOverview();
    loadAdminAllStoreProducts();
  }

  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.scrollTop = 0;
  }
  if (typeof refreshSystemNotifications === 'function') {
    refreshSystemNotifications();
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

    const billingSel = document.getElementById('flow-checkout-billing-select');
    const selectedOpt = billingSel && billingSel.selectedIndex >= 0 ? billingSel.options[billingSel.selectedIndex] : null;
    const billingClientId = selectedOpt ? parseInt(selectedOpt.value, 10) : activeClientId;
    const billingCnpj = selectedOpt ? (selectedOpt.getAttribute('data-cnpj') || '') : '';
    const billingName = selectedOpt ? (selectedOpt.getAttribute('data-name') || '') : '';

    const res = await fetch('/api/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: activeClientId,
        billing_client_id: billingClientId,
        billing_cnpj: billingCnpj,
        billing_name: billingName,
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
      const statusRaw = (s.status || 'em_aberto').toLowerCase();
      const isEmAberto = statusRaw === 'em_aberto';
      const isSeparacao = ['separacao', 'em_preparacao', 'draft', 'quoted'].includes(statusRaw);
      const isACaminho = ['a_caminho', 'dispatched'].includes(statusRaw);
      const isEntregue = ['entregue', 'delivered'].includes(statusRaw);

      if (statusFilter === 'em_aberto' && !isEmAberto) return false;
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
    let statusRaw = (s.status || 'em_aberto').toLowerCase();
    
    // Normalizar status
    let isEmAberto = statusRaw === 'em_aberto';
    let isSeparacao = ['separacao', 'em_preparacao', 'draft', 'quoted'].includes(statusRaw);
    let isACaminho = ['a_caminho', 'dispatched'].includes(statusRaw);
    let isEntregue = ['entregue', 'delivered'].includes(statusRaw);

    let statusTitleText = 'Em preparação';
    let statusHeadlineText = 'Separação do pedido';
    let statusSubtitleText = 'Em breve, informaremos o horário em que vamos chegar no seu endereço.';

    if (isEmAberto) {
      statusTitleText = 'Em aberto';
      statusHeadlineText = 'Aguardando conferência e aprovação';
      statusSubtitleText = 'Nosso colaborador está conferindo os detalhes da sua remessa.';
    } else if (isACaminho) {
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

    const statusBadgeTopHTML = isEmAberto
      ? `<span style="font-size: 0.95rem; font-weight: 700; color: #d97706;">Em aberto</span>`
      : `<span style="font-size: 0.95rem; font-weight: 700; color: ${isEntregue ? '#16a34a' : (isACaminho ? '#0284c7' : '#d97706')};">
           ${isEntregue ? 'Entregue' : (isACaminho ? 'A caminho' : 'Em preparação')}
         </span>`;

    return `
      <div class="shipment-card" style="${isEmAberto ? 'border-left: 5px solid #f59e0b;' : ''}">
        <!-- Top Bar: Status & Badge do Cliente à Esquerda | Código & Transportadora à Direita -->
        <div class="shipment-card-top-bar">
          <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
            ${statusBadgeTopHTML}

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
              <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap; align-items: center;">
                <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem; background: #ffffff; border: 1px solid #cbd5e1; color: #334155;" onclick="openShipmentDetailModal(${s.id})">Ver Mais / Detalhes</button>
                ${s.nf_url ? `<a href="${escapeHtml(s.nf_url)}" download target="_blank" class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem; background: #ffffff; border: 1px solid #86efac; color: #15803d; font-weight: 700; text-decoration: none;">Baixar NF</a>` : ''}
                <button class="btn btn-secondary admin-only ${currentRole === 'admin' ? '' : 'hidden'}" style="padding: 0.35rem 0.75rem; font-size: 0.78rem; background: #ffffff; border: 1px solid ${isEmAberto ? '#f59e0b' : '#cbd5e1'}; color: ${isEmAberto ? '#b45309' : '#334155'}; font-weight: ${isEmAberto ? '800' : '600'};" onclick="openUpdateStatusModal(${s.id}, '${s.status}', '${s.tracking_code || ''}')">
                  ${isEmAberto ? 'Aprovar / Alterar Status (Admin)' : 'Atualizar Status (Admin)'}
                </button>
              </div>
            </div>
          </div>

          <!-- Coluna Direita: Linha do Tempo Compacta -->
          <div class="shipment-timeline-compact">
            <div class="timeline-step-compact ${isEmAberto ? 'active' : 'completed'}">
              <div class="timeline-dot" style="${isEmAberto ? 'background: #f59e0b; box-shadow: 0 0 0 3px #fef3c7;' : ''}"></div>
              <div class="timeline-step-compact-title" style="${isEmAberto ? 'color: #b45309; font-weight: 800;' : ''}">
                Em aberto ${createdDate ? `<span style="font-weight: 400; font-size: 0.74rem; color: #94a3b8;">(${createdDate})</span>` : ''}
              </div>
              <div class="timeline-step-compact-subtext">${isEmAberto ? 'Aguardando conferência e aprovação da equipe.' : 'Pedido conferido e aprovado.'}</div>
            </div>

            <div class="timeline-step-compact ${isSeparacao ? 'active' : ((isACaminho || isEntregue) ? 'completed' : '')}">
              <div class="timeline-dot"></div>
              <div class="timeline-step-compact-title">
                Em preparação
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
      <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1.15rem;">
        Total de Volumes: <strong>${s.total_volumes} volume(s)</strong> | Peso Total: <strong>${(s.total_weight || 0).toFixed(3)} kg</strong>
      </div>

      <!-- Seção de Nota Fiscal (NF) e Boleto em Ver Mais da Remessa -->
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0.9rem 1rem;">
        <div style="font-size: 0.78rem; font-weight: 800; text-transform: uppercase; color: #334155; margin-bottom: 0.45rem;">
          Documentos Fiscais & Faturamento (NF / Boleto)
        </div>
        ${(s.nf_url || s.boleto_url)
          ? `<div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
               ${s.nf_number ? `<span style="font-size: 0.82rem; font-weight: 700; color: #0f172a;">Nº NF: ${escapeHtml(s.nf_number)}</span>` : ''}
               ${s.nf_url ? `<a href="${escapeHtml(s.nf_url)}" download target="_blank" class="btn btn-sm" style="background: #16a34a; color: #ffffff; text-decoration: none; font-size: 0.78rem; font-weight: 700; padding: 0.4rem 0.85rem; border-radius: 6px;">Baixar Nota Fiscal (NF)</a>` : ''}
               ${s.boleto_url ? `<a href="${escapeHtml(s.boleto_url)}" download target="_blank" class="btn btn-sm" style="background: #2563eb; color: #ffffff; text-decoration: none; font-size: 0.78rem; font-weight: 700; padding: 0.4rem 0.85rem; border-radius: 6px;">Baixar Boleto</a>` : ''}
             </div>`
          : `<div style="font-size: 0.82rem; color: #64748b;">Nenhuma Nota Fiscal ou Boleto anexado para esta remessa até o momento.</div>`
        }
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
    let normalized = (currentStatus || 'em_aberto').toLowerCase();
    if (normalized === 'em_aberto') select.value = 'em_aberto';
    else if (['separacao', 'em_preparacao', 'draft', 'quoted'].includes(normalized)) select.value = 'separacao';
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
   CARTEIRA UNIFICADA & CONTROLE DE FATURAMENTO (FLOW + LOJA VIRTUAL)
   ========================================================================== */

let windowBillingShipments = [];
let windowBillingStoreOrders = [];
let activeReceiveBillingItems = [];

async function loadBillingData() {
  try {
    const [shipmentsRes, storeOrdersRes] = await Promise.all([
      fetch('/api/billing/shipments'),
      fetch('/api/store/orders')
    ]);

    const rawShipments = shipmentsRes.ok ? await shipmentsRes.json() : [];
    // Garantir que pedidos com status operacional 'em_aberto' ou 'draft' NÃO entrem na carteira
    windowBillingShipments = Array.isArray(rawShipments)
      ? rawShipments.filter(s => s.shipment_status !== 'em_aberto' && s.shipment_status !== 'draft' && s.status !== 'em_aberto' && s.status !== 'draft')
      : [];

    const rawStoreOrders = storeOrdersRes.ok ? await storeOrdersRes.json() : [];
    // Garantir que pedidos da loja com status 'em_aberto', 'aguardando_aprovacao_mae', 'recusado_matriz' ou 'cancelado' NÃO entrem na carteira
    windowBillingStoreOrders = Array.isArray(rawStoreOrders)
      ? rawStoreOrders.filter(o => !['cancelado', 'em_aberto', 'aguardando_aprovacao_mae', 'recusado_matriz'].includes(o.status))
      : [];
    allStoreBillingOrders = windowBillingStoreOrders;

    // Calcular totais unificados (Flow + Loja)
    let flowOpen = 0;
    let flowPaid = 0;
    (windowBillingShipments || []).forEach(s => {
      const val = parseFloat(s.final_freight_price) || 0;
      if (s.payment_status === 'pago') flowPaid += val;
      else flowOpen += val;
    });

    let storeOpen = 0;
    let storePaid = 0;
    (windowBillingStoreOrders || []).forEach(o => {
      const val = parseFloat(o.total_amount) || 0;
      if (o.payment_status === 'pago') storePaid += val;
      else storeOpen += val;
    });

    const totalOpen = flowOpen + storeOpen;
    const totalPaid = flowPaid + storePaid;

    const openEl = document.getElementById('billing-total-open');
    const breakdownEl = document.getElementById('billing-open-breakdown');
    const paidEl = document.getElementById('billing-total-paid');

    if (openEl) openEl.textContent = formatCurrencyBR(totalOpen);
    if (breakdownEl) {
      breakdownEl.textContent = `(Envios Flow: ${formatCurrencyBR(flowOpen)} • Compras Loja: ${formatCurrencyBR(storeOpen)})`;
    }
    if (paidEl) paidEl.textContent = formatCurrencyBR(totalPaid);

    // Popular opções de Condição de Faturamento no filtro
    const methodSelect = document.getElementById('filter-billing-method');
    if (methodSelect) {
      const currentVal = methodSelect.value;
      const storeMethods = [...new Set((windowBillingStoreOrders || []).map(o => o.payment_method || '30 DIAS BOLETO').filter(Boolean))];
      const allMethods = ['Frete Remessa Flow', ...storeMethods];
      methodSelect.innerHTML = '<option value="">Todas as condições</option>' +
        allMethods.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
      methodSelect.value = currentVal;
    }

    renderUnifiedBillingTable();
    if (typeof refreshSystemNotifications === 'function') refreshSystemNotifications();
  } catch (err) {
    console.error('Erro ao carregar dados da carteira unificada:', err);
  }
}

function handleBillingPeriodChange(periodVal) {
  const fromEl = document.getElementById('filter-billing-date-from');
  const toEl = document.getElementById('filter-billing-date-to');

  if (periodVal !== 'custom') {
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
  }
  renderUnifiedBillingTable();
}
window.handleBillingPeriodChange = handleBillingPeriodChange;

function handleBillingCustomDateChange() {
  const periodEl = document.getElementById('filter-billing-period');
  const fromVal = document.getElementById('filter-billing-date-from')?.value || '';
  const toVal = document.getElementById('filter-billing-date-to')?.value || '';

  if ((fromVal || toVal) && periodEl) {
    periodEl.value = 'custom';
  }
  renderUnifiedBillingTable();
}
window.handleBillingCustomDateChange = handleBillingCustomDateChange;

function clearUnifiedBillingFilters() {
  const per = document.getElementById('filter-billing-period');
  const dFrom = document.getElementById('filter-billing-date-from');
  const dTo = document.getElementById('filter-billing-date-to');
  const orig = document.getElementById('filter-billing-origin');
  const stat = document.getElementById('filter-billing-status');
  const meth = document.getElementById('filter-billing-method');
  if (per) per.value = 'all';
  if (dFrom) dFrom.value = '';
  if (dTo) dTo.value = '';
  if (orig) orig.value = '';
  if (stat) stat.value = '';
  if (meth) meth.value = '';
  renderUnifiedBillingTable();
}
window.clearUnifiedBillingFilters = clearUnifiedBillingFilters;

let receiveBillingReturnTab = 'tab-billing';

function normalizeBillingPaymentStatus(rawStatus) {
  if (rawStatus === 'pago') return 'pago';
  if (rawStatus === 'aguardando_pagamento') return 'aguardando_pagamento';
  return 'em_aberto';
}

function getUnifiedApprovedBillingEntries() {
  const flowEntries = (windowBillingShipments || []).map(s => {
    const branchLabel = s.client_branch ? `[Sede ${s.client_branch}] ` : '';
    const billingTarget = s.billing_cnpj ? ` • Faturar p/: ${s.billing_name || ''} (${s.billing_cnpj})` : '';
    return {
      uid: `flow-${s.id}`,
      id: s.id,
      origin: 'flow',
      code: s.code,
      created_at: s.created_at,
      billed_at: s.billed_at,
      amount: parseFloat(s.final_freight_price) || 0,
      payment_status: normalizeBillingPaymentStatus(s.payment_status),
      payment_method: 'Frete Remessa Flow',
      client_name: `${branchLabel}${s.client_name || ''}`,
      billing_cnpj: s.billing_cnpj || '',
      billing_name: s.billing_name || '',
      nf_url: s.nf_url || '',
      nf_number: s.nf_number || '',
      boleto_url: s.boleto_url || '',
      description: `Envio de remessa — ${s.recipient_name || 'Destinatário'} (${s.dest_city || ''}/${s.dest_state || ''})${billingTarget}`
    };
  });

  const storeEntries = (windowBillingStoreOrders || []).map(o => {
    const itemsText = (o.items || []).map(it => `${it.product_name} (${it.tier_qty} pçs)`).join(', ');
    const branchLabel = o.client_branch ? `[Sede ${o.client_branch}] ` : '';
    const billingTarget = o.billing_cnpj ? ` • Faturar p/: ${o.billing_name || ''} (${o.billing_cnpj})` : '';
    return {
      uid: `store-${o.id}`,
      id: o.id,
      origin: 'store',
      code: o.code,
      created_at: o.created_at,
      billed_at: o.billed_at,
      amount: parseFloat(o.total_amount) || 0,
      payment_status: normalizeBillingPaymentStatus(o.payment_status),
      payment_method: o.payment_method || '30 DIAS BOLETO',
      client_name: `${branchLabel}${o.client_name || ''}`,
      billing_cnpj: o.billing_cnpj || '',
      billing_name: o.billing_name || '',
      nf_url: o.nf_url || '',
      nf_number: o.nf_number || '',
      boleto_url: o.boleto_url || '',
      description: `Compra Loja (${o.delivery_type === 'flow' ? 'Envio Flow' : 'Envio Direto'})${itemsText ? ' — ' + itemsText : ''}${billingTarget}`
    };
  });

  return [...flowEntries, ...storeEntries].sort((a, b) => {
    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tB - tA;
  });
}

function renderUnifiedBillingTable() {
  const tbody = document.getElementById('billing-shipments-tbody');
  if (!tbody) return;

  const selectAllCb = document.getElementById('billing-select-all');
  if (selectAllCb) selectAllCb.checked = false;
  updateSelectedBillingCount();

  const isAdmin = currentRole === 'admin';
  document.querySelectorAll('#tab-billing .admin-only').forEach(el => {
    if (!el.classList.contains('tab-page')) {
      if (isAdmin) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });

  let combined = getUnifiedApprovedBillingEntries();

  const periodFilter = document.getElementById('filter-billing-period')?.value || 'all';
  const dateFromStr = document.getElementById('filter-billing-date-from')?.value || '';
  const dateToStr = document.getElementById('filter-billing-date-to')?.value || '';
  const originFilter = document.getElementById('filter-billing-origin')?.value || '';
  const statusFilter = document.getElementById('filter-billing-status')?.value || '';
  const methodFilter = document.getElementById('filter-billing-method')?.value || '';

  // Filtro por Data / Período
  const now = new Date();
  if (periodFilter === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    combined = combined.filter(item => {
      if (!item.created_at) return false;
      const ts = new Date(item.created_at).getTime();
      return !isNaN(ts) && ts >= startOfToday;
    });
  } else if (periodFilter === 'this_month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    combined = combined.filter(item => {
      if (!item.created_at) return false;
      const ts = new Date(item.created_at).getTime();
      return !isNaN(ts) && ts >= startOfMonth;
    });
  } else if (periodFilter === '7d' || periodFilter === '30d' || periodFilter === '90d') {
    const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
    const cutoff = now.getTime() - daysMap[periodFilter] * 86400000;
    combined = combined.filter(item => {
      if (!item.created_at) return false;
      const ts = new Date(item.created_at).getTime();
      return !isNaN(ts) && ts >= cutoff;
    });
  } else if (dateFromStr || dateToStr) {
    const startTs = dateFromStr ? new Date(dateFromStr + 'T00:00:00').getTime() : null;
    const endTs = dateToStr ? new Date(dateToStr + 'T23:59:59').getTime() : null;
    combined = combined.filter(item => {
      if (!item.created_at) return false;
      const ts = new Date(item.created_at).getTime();
      if (isNaN(ts)) return false;
      if (startTs !== null && ts < startTs) return false;
      if (endTs !== null && ts > endTs) return false;
      return true;
    });
  }

  if (originFilter) {
    combined = combined.filter(item => item.origin === originFilter);
  }
  if (statusFilter) {
    combined = combined.filter(item => item.payment_status === statusFilter);
  }
  if (methodFilter) {
    combined = combined.filter(item => item.payment_method === methodFilter);
  }

  if (combined.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${isAdmin ? 9 : 8}" style="text-align: center; color: var(--text-muted); padding: 1.75rem; font-size: 0.76rem;">Nenhum lançamento financeiro aprovado encontrado para os filtros selecionados.</td></tr>`;
    return;
  }

  tbody.innerHTML = combined.map(item => {
    const isPaid = item.payment_status === 'pago';
    const isStore = item.origin === 'store';
    const formattedDate = item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '-';
    const priceFormatted = formatCurrencyBR(item.amount);
    const valueHTML = `<strong style="color: ${isPaid ? '#16a34a' : '#dc2626'}; font-size: 0.77rem;">${priceFormatted}</strong>`;

    const originBadgeHTML = isStore
      ? `<span style="color: #59338f; font-size: 0.72rem; font-weight: 700;">Loja</span>`
      : `<span style="color: #334155; font-size: 0.72rem; font-weight: 700;">Flow</span>`;

    const orderHTML = isStore
      ? `<button type="button" onclick="openStoreOrderDetailPage(${item.id}, 'tab-billing')"
                 style="background: none; border: none; padding: 0; color: #59338f; font-weight: 800; font-family: monospace; font-size: 0.76rem; text-decoration: underline; cursor: pointer;"
                 title="Clique para abrir o Resumo do Pedido da Loja">
           ${escapeHtml(item.code)}
         </button>`
      : `<button type="button" onclick="openShipmentDetailModal(${item.id})"
                 style="background: none; border: none; padding: 0; color: #4f46e5; font-weight: 700; font-family: monospace; font-size: 0.76rem; text-decoration: underline; cursor: pointer;"
                 title="Clique para ver os detalhes da remessa">
           ${escapeHtml(item.code)}
         </button>`;

    const methodBadgeHTML = isStore
      ? `<span style="color: #59338f; font-weight: 700; font-size: 0.71rem;">${escapeHtml(item.payment_method)}</span>`
      : `<span style="font-size: 0.71rem; color: #64748b; font-weight: 600;">Frete Flow</span>`;

    const descWithClient = (isAdmin && item.client_name)
      ? `<strong style="color: #0f172a;">${escapeHtml(item.client_name)}</strong> — ${escapeHtml(item.description)}`
      : escapeHtml(item.description);

    const checkboxHTML = isAdmin
      ? `<td style="text-align: center; padding: 0.45rem 0.35rem;">
           <input type="checkbox" class="billing-item-checkbox"
                  data-id="${item.id}"
                  data-origin="${item.origin}"
                  data-code="${escapeHtml(item.code)}"
                  data-amount="${item.amount}"
                  data-nf-number="${escapeHtml(item.nf_number || '')}"
                  data-nf-url="${escapeHtml(item.nf_url || '')}"
                  data-boleto-url="${escapeHtml(item.boleto_url || '')}"
                  data-status="${item.payment_status}"
                  onchange="updateSelectedBillingCount()" style="cursor: pointer; width: 14px; height: 14px;">
         </td>`
      : ``;

    // Coluna de Documentos: Boleto e NF (sem emojis e sem balão, apenas cor e sublinhado)
    const docsParts = [];
    if (item.boleto_url) {
      docsParts.push(`<a href="${escapeHtml(item.boleto_url)}" download target="_blank" style="color: #2563eb; font-size: 0.71rem; font-weight: 700; text-decoration: underline;" title="Baixar Boleto">Boleto</a>`);
    }
    if (item.nf_url) {
      const nfLabel = item.nf_number ? `NF ${escapeHtml(item.nf_number)}` : 'NF';
      docsParts.push(`<a href="${escapeHtml(item.nf_url)}" download target="_blank" style="color: #15803d; font-size: 0.71rem; font-weight: 700; text-decoration: underline;" title="Baixar Nota Fiscal">${nfLabel}</a>`);
    } else if (item.nf_number) {
      docsParts.push(`<span style="font-size: 0.71rem; color: #475569; font-weight: 700;">NF: ${escapeHtml(item.nf_number)}</span>`);
    }
    const docsCellHTML = docsParts.length > 0
      ? `<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">${docsParts.join('')}</div>`
      : `<span style="color: #94a3b8; font-size: 0.68rem;">Pendente</span>`;

    const toggleReopenFn = isStore
      ? `toggleStoreOrderPaymentStatus(${item.id}, 'em_aberto')`
      : `setShipmentPaymentStatus(${item.id}, 'em_aberto')`;

    const approvePayFn = isStore
      ? `toggleStoreOrderPaymentStatus(${item.id}, 'pago')`
      : `setShipmentPaymentStatus(${item.id}, 'pago')`;

    const isWaitingPay = item.payment_status === 'aguardando_pagamento';

    let statusBadgeTextHTML = '';
    if (isPaid) {
      statusBadgeTextHTML = `<span style="font-size: 0.71rem; font-weight: 700; color: #16a34a; white-space: nowrap;">Pago</span>`;
    } else if (isWaitingPay) {
      statusBadgeTextHTML = `<span style="font-size: 0.71rem; font-weight: 700; color: #d97706; white-space: nowrap;">Aguard. Pagamento</span>`;
    } else {
      statusBadgeTextHTML = `<span style="font-size: 0.71rem; font-weight: 700; color: #dc2626; white-space: nowrap;">Em Aberto</span>`;
    }

    const statusCellHTML = isAdmin
      ? `<div style="display: flex; align-items: center; gap: 5px; flex-wrap: nowrap;">
           ${statusBadgeTextHTML}
           ${!isPaid && !isWaitingPay
             ? `<button type="button" onclick="openSingleReceiveBillingModal(${item.id}, '${item.origin}')" class="btn btn-sm" style="background: #2563eb; color: #fff; font-size: 0.67rem; font-weight: 700; padding: 2px 8px; border: none; border-radius: 4px; cursor: pointer;" title="Gerar cobrança (Aguard. Pagamento) e anexar NF / Boleto">
                  Receber
                </button>`
             : ''}
           ${isWaitingPay
             ? `<button type="button" onclick="${approvePayFn}" class="btn btn-sm" style="background: #16a34a; color: #fff; font-size: 0.67rem; font-weight: 700; padding: 2px 8px; border: none; border-radius: 4px; cursor: pointer;" title="Aprovar pagamento deste pedido">
                  Aprovar
                </button>
                <button type="button" onclick="openSingleReceiveBillingModal(${item.id}, '${item.origin}')" class="btn btn-sm" style="background: #eff6ff; color: #1d4ed8; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border: 1px solid #bfdbfe; border-radius: 4px; cursor: pointer;" title="Alterar NF ou Boleto">
                  NF/Boleto
                </button>`
             : ''}
           ${isPaid
             ? `<button type="button" onclick="openSingleReceiveBillingModal(${item.id}, '${item.origin}')" class="btn btn-sm" style="background: #eff6ff; color: #1d4ed8; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border: 1px solid #bfdbfe; border-radius: 4px; cursor: pointer;" title="Ver ou alterar NF e Boleto">NF/Boleto</button>
                <button type="button" onclick="${toggleReopenFn}" class="btn btn-sm" style="background: #f8fafc; color: #64748b; font-size: 0.65rem; padding: 2px 6px; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">Reabrir</button>`
             : ''}
           ${!isStore
             ? `<button type="button" onclick="deleteBillingShipment(${item.id}, '${escapeHtml(item.code)}')" class="btn btn-sm" style="background: #fff; color: #ef4444; border: 1px solid #fecaca; font-size: 0.66rem; padding: 2px 5px; border-radius: 4px; cursor: pointer;" title="Excluir lançamento">&times;</button>`
             : ''}
         </div>`
      : statusBadgeTextHTML;

    return `
      <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
        ${checkboxHTML}
        <td style="padding: 0.48rem 0.65rem; color: #475569; white-space: nowrap;">${formattedDate}</td>
        <td style="padding: 0.48rem 0.65rem;">${originBadgeHTML}</td>
        <td style="padding: 0.48rem 0.65rem; white-space: nowrap;">${valueHTML}</td>
        <td style="padding: 0.48rem 0.65rem; white-space: nowrap;">${orderHTML}</td>
        <td style="padding: 0.48rem 0.65rem; white-space: nowrap;">${methodBadgeHTML}</td>
        <td style="padding: 0.48rem 0.65rem; color: #64748b; font-size: 0.72rem; max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.description)}">${descWithClient}</td>
        <td style="padding: 0.48rem 0.65rem;">${docsCellHTML}</td>
        <td style="padding: 0.48rem 0.65rem;">${statusCellHTML}</td>
      </tr>
    `;
  }).join('');
}
window.renderUnifiedBillingTable = renderUnifiedBillingTable;
window.renderBillingShipmentsTable = renderUnifiedBillingTable;

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

function openSingleReceiveBillingModal(itemId, origin) {
  let found = null;
  if (origin === 'store') {
    const o = (windowBillingStoreOrders || []).find(x => x.id === itemId) || (allStoreBillingOrders || []).find(x => x.id === itemId);
    if (o) {
      found = {
        id: o.id,
        origin: 'store',
        code: o.code,
        amount: parseFloat(o.total_amount) || 0,
        nf_number: o.nf_number || '',
        nf_url: o.nf_url || '',
        boleto_url: o.boleto_url || '',
        payment_status: o.payment_status || 'em_aberto'
      };
    }
  } else {
    const s = (windowBillingShipments || []).find(x => x.id === itemId);
    if (s) {
      found = {
        id: s.id,
        origin: 'flow',
        code: s.code,
        amount: parseFloat(s.final_freight_price) || 0,
        nf_number: s.nf_number || '',
        nf_url: s.nf_url || '',
        boleto_url: s.boleto_url || '',
        payment_status: s.payment_status || 'em_aberto'
      };
    }
  }

  if (!found && Array.isArray(window._lastClientBillingCombined)) {
    const cItem = window._lastClientBillingCombined.find(x => x.id === itemId && x.origin === origin);
    if (cItem) {
      found = {
        id: cItem.id,
        origin: cItem.origin,
        code: cItem.code,
        amount: cItem.amount || 0,
        nf_number: cItem.nf_number || '',
        nf_url: cItem.nf_url || '',
        boleto_url: cItem.boleto_url || '',
        payment_status: cItem.payment_status || 'em_aberto'
      };
    }
  }

  if (!found) {
    found = { id: itemId, origin: origin || 'flow', code: `#${itemId}`, amount: 0, nf_number: '', nf_url: '', boleto_url: '', payment_status: 'em_aberto' };
  }

  openReceiveBillingModalWithItems([found]);
}
window.openSingleReceiveBillingModal = openSingleReceiveBillingModal;

function openReceiveBillingModalFromSelection(source = 'main') {
  const selector = source === 'client' ? '.client-billing-item-checkbox:checked' : '.billing-item-checkbox:checked';
  const checked = document.querySelectorAll(selector);
  if (!checked || checked.length === 0) {
    showToast('Selecione pelo menos um pedido para receber ou cobrar.', 'warning');
    return;
  }

  const items = Array.from(checked).map(cb => ({
    id: parseInt(cb.getAttribute('data-id'), 10),
    origin: cb.getAttribute('data-origin') || 'flow',
    code: cb.getAttribute('data-code') || '',
    amount: parseFloat(cb.getAttribute('data-amount')) || 0,
    nf_number: cb.getAttribute('data-nf-number') || '',
    nf_url: cb.getAttribute('data-nf-url') || '',
    boleto_url: cb.getAttribute('data-boleto-url') || '',
    payment_status: cb.getAttribute('data-status') || 'em_aberto'
  }));

  openReceiveBillingModalWithItems(items);
}
window.openReceiveBillingModalFromSelection = openReceiveBillingModalFromSelection;

function openReceiveBillingModalWithItems(items) {
  activeReceiveBillingItems = items || [];
  const form = document.getElementById('form-billing-receive');
  if (form) form.reset();

  // Identifica de qual página o usuário veio para retornar sem usar popup
  const activePage = document.querySelector('.tab-page:not(.hidden)');
  if (activePage && activePage.id === 'page-client-detail') {
    receiveBillingReturnTab = 'page-client-detail';
  } else if (activePage && activePage.id !== 'page-billing-receive') {
    receiveBillingReturnTab = activePage.id;
  } else {
    receiveBillingReturnTab = 'tab-billing';
  }

  const backLabel = document.getElementById('receive-billing-back-label');
  if (backLabel) {
    backLabel.textContent = receiveBillingReturnTab === 'page-client-detail'
      ? 'Voltar para Carteira do Cliente'
      : 'Voltar para Carteira';
  }

  const countEl = document.getElementById('receive-modal-count');
  const totalEl = document.getElementById('receive-modal-total');
  const listEl = document.getElementById('receive-modal-items-list');
  const nfNumInput = document.getElementById('receive-nf-number');
  const statusInput = document.getElementById('receive-payment-status');
  const existingNfInfo = document.getElementById('receive-existing-nf-info');
  const existingBoletoInfo = document.getElementById('receive-existing-boleto-info');

  const totalAmount = activeReceiveBillingItems.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);
  if (countEl) countEl.textContent = activeReceiveBillingItems.length;
  if (totalEl) totalEl.textContent = formatCurrencyBR(totalAmount);

  if (listEl) {
    listEl.innerHTML = activeReceiveBillingItems.map(it => `
      <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #e2e8f0;">
        <span><strong style="font-family: monospace;">${escapeHtml(it.code)}</strong> (${it.origin === 'store' ? 'Loja Virtual' : 'Envio Flow'})</span>
        <strong>${formatCurrencyBR(it.amount)}</strong>
      </div>
    `).join('');
  }

  const first = activeReceiveBillingItems[0] || {};
  if (nfNumInput) nfNumInput.value = first.nf_number || '';
  if (statusInput) {
    statusInput.value = 'aguardando_pagamento';
  }

  if (existingNfInfo) {
    if (first.nf_url) {
      existingNfInfo.style.display = 'block';
      existingNfInfo.innerHTML = `Já possui NF anexada (<a href="${escapeHtml(first.nf_url)}" target="_blank" style="color: #15803d; font-weight: 700;">Ver atual</a>). Envie outro arquivo apenas se quiser substituir.`;
    } else {
      existingNfInfo.style.display = 'none';
      existingNfInfo.innerHTML = '';
    }
  }

  if (existingBoletoInfo) {
    if (first.boleto_url) {
      existingBoletoInfo.style.display = 'block';
      existingBoletoInfo.innerHTML = `Já possui Boleto anexado (<a href="${escapeHtml(first.boleto_url)}" target="_blank" style="color: #1d4ed8; font-weight: 700;">Ver atual</a>). Envie outro arquivo apenas se quiser substituir.`;
    } else {
      existingBoletoInfo.style.display = 'none';
      existingBoletoInfo.innerHTML = '';
    }
  }

  switchTab('page-billing-receive');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeReceiveBillingPage() {
  switchTab(receiveBillingReturnTab || 'tab-billing');
}
window.closeReceiveBillingPage = closeReceiveBillingPage;

async function submitReceiveBillingForm(e) {
  if (e) e.preventDefault();
  if (!activeReceiveBillingItems || activeReceiveBillingItems.length === 0) return;

  const btn = document.getElementById('btn-submit-receive-billing');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Salvando...';
  }

  try {
    const formData = new FormData();
    formData.append('items', JSON.stringify(activeReceiveBillingItems.map(i => ({ id: i.id, origin: i.origin }))));
    formData.append('nf_number', document.getElementById('receive-nf-number')?.value.trim() || '');
    // Sempre que gerar um receber ele fica com status de Aguard. Pagamento
    formData.append('payment_status', 'aguardando_pagamento');

    const nfFile = document.getElementById('receive-nf-file')?.files[0];
    const boletoFile = document.getElementById('receive-boleto-file')?.files[0];
    if (nfFile) formData.append('nf_file', nfFile);
    if (boletoFile) formData.append('boleto_file', boletoFile);

    const res = await fetch('/api/billing/receive', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar recebimento/cobrança.');

    showToast(data.message || 'Cobrança gerada (Aguard. Pagamento) com sucesso!', 'success');
    closeReceiveBillingPage();

    await loadBillingData();
    if (activeManagingClientId) {
      await loadClientBilling(activeManagingClientId);
    }
    if (typeof loadClients === 'function') {
      await loadClients();
    }
    if (typeof loadInvoicesNfData === 'function') {
      loadInvoicesNfData();
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Gerar Recebimento (Aguard. Pagamento)';
    }
  }
}
window.submitReceiveBillingForm = submitReceiveBillingForm;

async function loadInvoicesNfData() {
  await loadBillingData();
  renderInvoicesNfTable();
}
window.loadInvoicesNfData = loadInvoicesNfData;

function renderInvoicesNfTable() {
  const tbody = document.getElementById('invoices-nf-tbody');
  if (!tbody) return;

  const searchVal = (document.getElementById('filter-nf-search')?.value || '').trim().toLowerCase();
  const originVal = document.getElementById('filter-nf-origin')?.value || '';

  // Mostra todos os lançamentos aprovados que possuem NF anexada (ou número de NF / Boleto) ou permite consultar todos os faturados
  let entries = getUnifiedApprovedBillingEntries().filter(item => item.nf_url || item.nf_number || item.boleto_url);

  if (originVal) {
    entries = entries.filter(item => item.origin === originVal);
  }
  if (searchVal) {
    entries = entries.filter(item =>
      (item.nf_number || '').toLowerCase().includes(searchVal) ||
      (item.code || '').toLowerCase().includes(searchVal) ||
      (item.client_name || '').toLowerCase().includes(searchVal) ||
      (item.description || '').toLowerCase().includes(searchVal)
    );
  }

  if (entries.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #64748b; font-size: 0.78rem;">Nenhuma Nota Fiscal emitida/anexada encontrada para os filtros selecionados.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map(item => {
    const isStore = item.origin === 'store';
    const isPaid = item.payment_status === 'pago';
    const dateStr = (item.billed_at || item.created_at) ? new Date(item.billed_at || item.created_at).toLocaleDateString('pt-BR') : '-';
    const nfBadge = item.nf_number
      ? `<strong style="font-family: monospace; color: #0f172a; font-size: 0.8rem;">${escapeHtml(item.nf_number)}</strong>`
      : `<span style="color: #64748b; font-size: 0.74rem;">NF Anexada</span>`;

    const orderBtn = isStore
      ? `<button type="button" onclick="openStoreOrderDetailPage(${item.id}, 'tab-invoices-nf')" style="background: none; border: none; padding: 0; color: #59338f; font-weight: 800; font-family: monospace; font-size: 0.78rem; text-decoration: underline; cursor: pointer;">${escapeHtml(item.code)}</button>`
      : `<button type="button" onclick="openShipmentDetailModal(${item.id})" style="background: none; border: none; padding: 0; color: #4f46e5; font-weight: 700; font-family: monospace; font-size: 0.78rem; text-decoration: underline; cursor: pointer;">${escapeHtml(item.code)}</button>`;

    const originBadge = isStore
      ? `<span style="color: #59338f; font-size: 0.74rem; font-weight: 700;">Loja Virtual</span>`
      : `<span style="color: #334155; font-size: 0.74rem; font-weight: 700;">Envio Flow</span>`;

    const clientAndDesc = item.client_name
      ? `<strong>${escapeHtml(item.client_name)}</strong> — ${escapeHtml(item.description)}`
      : escapeHtml(item.description);

    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 0.55rem 0.75rem;">${nfBadge}</td>
        <td style="padding: 0.55rem 0.75rem; color: #475569;">${dateStr}</td>
        <td style="padding: 0.55rem 0.75rem;">${orderBtn}</td>
        <td style="padding: 0.55rem 0.75rem;">${originBadge}</td>
        <td style="padding: 0.55rem 0.75rem; color: #475569; max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${clientAndDesc}</td>
        <td style="padding: 0.55rem 0.75rem; font-weight: 700; color: #0f172a;">${formatCurrencyBR(item.amount)}</td>
        <td style="padding: 0.55rem 0.75rem;">
          <span style="font-weight: 700; color: ${isPaid ? '#16a34a' : (item.payment_status === 'aguardando_pagamento' ? '#d97706' : '#dc2626')}; font-size: 0.74rem;">
            ${isPaid ? 'Pago' : (item.payment_status === 'aguardando_pagamento' ? 'Aguard. Pagamento' : 'Em Aberto')}
          </span>
        </td>
        <td style="padding: 0.55rem 0.75rem; text-align: right;">
          <div style="display: inline-flex; gap: 6px; align-items: center;">
            ${item.nf_url
              ? `<a href="${escapeHtml(item.nf_url)}" download target="_blank" style="background: #16a34a; color: #ffffff; font-size: 0.7rem; font-weight: 700; padding: 4px 10px; border-radius: 5px; text-decoration: none;">Baixar NF</a>`
              : ''}
            ${item.boleto_url
              ? `<a href="${escapeHtml(item.boleto_url)}" download target="_blank" style="background: #2563eb; color: #ffffff; font-size: 0.7rem; font-weight: 700; padding: 4px 10px; border-radius: 5px; text-decoration: none;">Baixar Boleto</a>`
              : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
window.renderInvoicesNfTable = renderInvoicesNfTable;

async function batchSetPaymentStatus(targetStatus) {
  const selected = document.querySelectorAll('.billing-item-checkbox:checked');
  if (selected.length === 0) {
    showToast('Selecione pelo menos um lançamento para dar baixa.', 'warning');
    return;
  }

  const flowIds = [];
  const storeIds = [];
  selected.forEach(cb => {
    const id = parseInt(cb.getAttribute('data-id'), 10);
    const orig = cb.getAttribute('data-origin') || 'flow';
    if (orig === 'store') storeIds.push(id);
    else flowIds.push(id);
  });

  try {
    if (flowIds.length > 0) {
      await fetch('/api/billing/shipments/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment_ids: flowIds, payment_status: targetStatus })
      });
    }
    if (storeIds.length > 0) {
      await Promise.all(storeIds.map(id =>
        fetch(`/api/store/orders/${id}/payment-status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_status: targetStatus })
        })
      ));
    }

    showToast('Status financeiro atualizado para os lançamentos selecionados!', 'success');
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

  tbody.innerHTML = clients.map(client => {
    const isChild = Boolean(client.parent_client_id);
    const hierarchyTag = isChild
      ? `<div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">Sede ${escapeHtml(client.branch_number || '')} • Matriz: ${escapeHtml(client.parent_name || '#' + client.parent_client_id)}</div>`
      : (client.total_branches > 0
          ? `<div style="font-size: 0.72rem; color: #59338f; font-weight: 700;">Conta Mãe (${client.total_branches} ${client.total_branches === 1 ? 'sede filha' : 'sedes filhas'})</div>`
          : `<div style="font-size: 0.72rem; color: #64748b; font-weight: 600;">Conta Principal</div>`);

    return `
      <tr>
        <td>
          <div style="font-weight: 700;">${escapeHtml(client.name)}</div>
          ${hierarchyTag}
        </td>
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
    `;
  }).join('');
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
  loadClientStoreAdmin(clientId);
  if (typeof loadAdminClientBranches === 'function') {
    loadAdminClientBranches(clientId);
  }
}
window.openClientDetailPage = openClientDetailPage;
window.openManageClientModal = openClientDetailPage;

function switchClientDetailTab(tabName) {
  const tabs = ['products', 'store', 'billing', 'branches', 'info'];
  tabs.forEach(t => {
    const btn = document.getElementById(`btn-client-tab-${t}`);
    const content = document.getElementById(`client-subtab-${t}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (content) content.classList.toggle('hidden', t !== tabName);
  });
  if (tabName === 'billing' && activeManagingClientId) {
    loadClientBilling(activeManagingClientId);
  }
  if (tabName === 'store' && activeManagingClientId) {
    loadClientStoreAdmin(activeManagingClientId);
  }
  if (tabName === 'branches' && activeManagingClientId && typeof loadAdminClientBranches === 'function') {
    loadAdminClientBranches(activeManagingClientId);
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

  if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 1.25rem; font-size: 0.76rem;">Carregando carteira unificada...</td></tr>';

  try {
    const [cfgRes, shipmentsRes, storeOrdersRes] = await Promise.all([
      fetch(`/api/store/client-config/${clientId}`),
      fetch(`/api/billing/shipments?client_id=${clientId}`),
      fetch(`/api/store/orders?client_id=${clientId}`)
    ]);

    if (cfgRes.ok) {
      currentClientStoreConfig = await cfgRes.json();
      renderClientPaymentMethodsTags();
    }

    const rawShipments = shipmentsRes.ok ? await shipmentsRes.json() : [];
    const shipments = Array.isArray(rawShipments)
      ? rawShipments.filter(s => s.shipment_status !== 'em_aberto' && s.shipment_status !== 'draft' && s.status !== 'em_aberto' && s.status !== 'draft')
      : [];

    const rawStoreOrders = storeOrdersRes.ok ? await storeOrdersRes.json() : [];
    const storeOrders = Array.isArray(rawStoreOrders)
      ? rawStoreOrders.filter(o => !['cancelado', 'em_aberto', 'aguardando_aprovacao_mae', 'recusado_matriz'].includes(o.status))
      : [];
    allStoreBillingOrders = storeOrders;

    let openTotal = 0;
    let paidTotal = 0;

    const flowItems = (shipments || []).map(s => {
      const val = parseFloat(s.final_freight_price) || 0;
      const pStatus = normalizeBillingPaymentStatus(s.payment_status);
      const isPaid = pStatus === 'pago';
      if (isPaid) paidTotal += val;
      else openTotal += val;
      const branchPart = s.client_branch ? `[Sede ${s.client_branch}] ` : '';
      const billPart = s.billing_cnpj ? ` • Faturar p/: ${s.billing_name || ''} (${s.billing_cnpj})` : '';
      return {
        id: s.id,
        origin: 'flow',
        code: s.code,
        created_at: s.created_at,
        info: `${branchPart}Frete Remessa — ${s.dest_city || ''}/${s.dest_state || ''}${billPart}`,
        amount: val,
        nf_url: s.nf_url || '',
        nf_number: s.nf_number || '',
        boleto_url: s.boleto_url || '',
        payment_status: pStatus,
        isPaid
      };
    });

    const storeItems = (storeOrders || []).map(o => {
      const val = parseFloat(o.total_amount) || 0;
      const pStatus = normalizeBillingPaymentStatus(o.payment_status);
      const isPaid = pStatus === 'pago';
      if (isPaid) paidTotal += val;
      else openTotal += val;
      const methodLabel = o.payment_method || '30 DIAS BOLETO';
      const branchPart = o.client_branch ? `[Sede ${o.client_branch} - ${o.client_name || ''}] ` : '';
      const billPart = o.billing_cnpj ? ` • Faturar p/: ${o.billing_name || ''} (${o.billing_cnpj})` : '';
      return {
        id: o.id,
        origin: 'store',
        code: o.code,
        created_at: o.created_at,
        info: `${branchPart}${methodLabel} (${o.delivery_type === 'flow' ? 'Envio Flow' : 'Envio Direto'})${billPart}`,
        amount: val,
        nf_url: o.nf_url || '',
        nf_number: o.nf_number || '',
        boleto_url: o.boleto_url || '',
        payment_status: pStatus,
        isPaid
      };
    });

    if (openBalEl) openBalEl.innerText = formatCurrencyBR(openTotal);
    if (paidBalEl) paidBalEl.innerText = formatCurrencyBR(paidTotal);

    const selectAllCb = document.getElementById('client-billing-select-all');
    if (selectAllCb) selectAllCb.checked = false;
    updateSelectedClientBillingCount();

    const combined = [...flowItems, ...storeItems].sort((a, b) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tB - tA;
    });

    window._lastClientBillingCombined = combined;
    renderClientBillingTable();
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="color: #ef4444; padding: 1.5rem;">Erro ao carregar carteira.</td></tr>`;
  }
}

function clearClientBillingFilters() {
  const dFrom = document.getElementById('filter-client-billing-date-from');
  const dTo = document.getElementById('filter-client-billing-date-to');
  const stat = document.getElementById('filter-client-billing-status');
  if (dFrom) dFrom.value = '';
  if (dTo) dTo.value = '';
  if (stat) stat.value = '';
  renderClientBillingTable();
}
window.clearClientBillingFilters = clearClientBillingFilters;

function renderClientBillingTable() {
  const tbody = document.getElementById('client-shipments-tbody');
  if (!tbody) return;

  const selectAllCb = document.getElementById('client-billing-select-all');
  if (selectAllCb) selectAllCb.checked = false;
  updateSelectedClientBillingCount();

  let combined = Array.isArray(window._lastClientBillingCombined) ? [...window._lastClientBillingCombined] : [];

  const dateFromStr = document.getElementById('filter-client-billing-date-from')?.value || '';
  const dateToStr = document.getElementById('filter-client-billing-date-to')?.value || '';
  const statusFilter = document.getElementById('filter-client-billing-status')?.value || '';

  if (dateFromStr || dateToStr) {
    const startTs = dateFromStr ? new Date(dateFromStr + 'T00:00:00').getTime() : null;
    const endTs = dateToStr ? new Date(dateToStr + 'T23:59:59').getTime() : null;
    combined = combined.filter(item => {
      if (!item.created_at) return false;
      const ts = new Date(item.created_at).getTime();
      if (isNaN(ts)) return false;
      if (startTs !== null && ts < startTs) return false;
      if (endTs !== null && ts > endTs) return false;
      return true;
    });
  }

  if (statusFilter) {
    combined = combined.filter(item => item.payment_status === statusFilter);
  }

  if (combined.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 1.5rem; font-size: 0.76rem;">Nenhuma cobrança aprovada encontrada para os filtros selecionados.</td></tr>';
    return;
  }

  tbody.innerHTML = combined.map(item => {
    const isPaid = item.isPaid;
    const isStore = item.origin === 'store';
    const formattedDate = item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '-';
    const priceFormatted = formatCurrencyBR(item.amount);

    const originBadge = isStore
      ? `<span style="color: #59338f; font-size: 0.72rem; font-weight: 700;">Loja</span>`
      : `<span style="color: #334155; font-size: 0.72rem; font-weight: 700;">Flow</span>`;

    const codeBtn = isStore
      ? `<button type="button" onclick="openStoreOrderDetailPage(${item.id}, 'page-client-detail')" style="background: none; border: none; padding: 0; color: #59338f; font-weight: 800; font-family: monospace; font-size: 0.76rem; text-decoration: underline; cursor: pointer;">${escapeHtml(item.code)}</button>`
      : `<button type="button" onclick="openShipmentDetailModal(${item.id})" style="background: none; border: none; padding: 0; color: #4f46e5; font-weight: 700; font-family: monospace; font-size: 0.76rem; text-decoration: underline; cursor: pointer;">${escapeHtml(item.code)}</button>`;

    const reopenClick = isStore
      ? `toggleStoreOrderPaymentStatus(${item.id}, 'em_aberto')`
      : `setShipmentPaymentStatus(${item.id}, 'em_aberto')`;

    const approveClick = isStore
      ? `toggleStoreOrderPaymentStatus(${item.id}, 'pago')`
      : `setShipmentPaymentStatus(${item.id}, 'pago')`;

    const isWaitingPay = item.payment_status === 'aguardando_pagamento';

    let clientStatusBadge = '';
    if (isPaid) {
      clientStatusBadge = '<span style="color: #16a34a; font-weight: 700; font-size: 0.71rem; white-space: nowrap;">Pago</span>';
    } else if (isWaitingPay) {
      clientStatusBadge = '<span style="color: #d97706; font-weight: 700; font-size: 0.71rem; white-space: nowrap;">Aguard. Pagamento</span>';
    } else {
      clientStatusBadge = '<span style="color: #dc2626; font-weight: 700; font-size: 0.71rem; white-space: nowrap;">Em Aberto</span>';
    }

    const docsParts = [];
    if (item.boleto_url) {
      docsParts.push(`<a href="${escapeHtml(item.boleto_url)}" download target="_blank" style="color: #2563eb; font-size: 0.71rem; font-weight: 700; text-decoration: underline;">Boleto</a>`);
    }
    if (item.nf_url) {
      const nfLabel = item.nf_number ? `NF ${escapeHtml(item.nf_number)}` : 'NF';
      docsParts.push(`<a href="${escapeHtml(item.nf_url)}" download target="_blank" style="color: #15803d; font-size: 0.71rem; font-weight: 700; text-decoration: underline;">${nfLabel}</a>`);
    }
    const docsHTML = docsParts.length > 0 ? `<div style="display: flex; gap: 8px; flex-wrap: wrap;">${docsParts.join('')}</div>` : `<span style="color: #94a3b8; font-size: 0.68rem;">Pendente</span>`;

    return `
      <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s ease;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
        <td style="text-align: center; padding: 0.45rem 0.35rem;">
          <input type="checkbox" class="client-billing-item-checkbox"
                 data-id="${item.id}"
                 data-origin="${item.origin}"
                 data-code="${escapeHtml(item.code)}"
                 data-amount="${item.amount}"
                 data-nf-number="${escapeHtml(item.nf_number || '')}"
                 data-nf-url="${escapeHtml(item.nf_url || '')}"
                 data-boleto-url="${escapeHtml(item.boleto_url || '')}"
                 data-status="${item.payment_status}"
                 onchange="updateSelectedClientBillingCount()" style="cursor: pointer; width: 14px; height: 14px;">
        </td>
        <td style="font-weight: 700; font-family: monospace; padding: 0.48rem 0.65rem;">${codeBtn}</td>
        <td style="padding: 0.48rem 0.65rem;">${originBadge}</td>
        <td style="padding: 0.48rem 0.65rem; color: #64748b; font-size: 0.73rem;">${formattedDate}</td>
        <td style="padding: 0.48rem 0.65rem; color: #334155; font-weight: 600; font-size: 0.73rem;">${escapeHtml(item.info)}</td>
        <td style="padding: 0.48rem 0.65rem; font-weight: 700; color: ${isPaid ? '#16a34a' : '#dc2626'}; font-size: 0.76rem;">${priceFormatted}</td>
        <td style="padding: 0.48rem 0.65rem;">${docsHTML}</td>
        <td style="padding: 0.48rem 0.65rem;">
          ${clientStatusBadge}
        </td>
        <td style="padding: 0.48rem 0.65rem; text-align: center;">
          <div style="display: flex; justify-content: center; gap: 5px; flex-wrap: nowrap;">
            ${!isPaid && !isWaitingPay
              ? `<button type="button" class="btn btn-sm" onclick="openSingleReceiveBillingModal(${item.id}, '${item.origin}')" style="background: #2563eb; color: #ffffff; border: none; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.67rem; cursor: pointer;">Receber</button>`
              : ''}
            ${isWaitingPay
              ? `<button type="button" class="btn btn-sm" onclick="${approveClick}" style="background: #16a34a; color: #ffffff; border: none; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 0.67rem; cursor: pointer;">Aprovar</button>
                 <button type="button" class="btn btn-sm" onclick="openSingleReceiveBillingModal(${item.id}, '${item.origin}')" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 0.65rem; cursor: pointer;">NF/Boleto</button>`
              : ''}
            ${isPaid
              ? `<button type="button" class="btn btn-sm" onclick="openSingleReceiveBillingModal(${item.id}, '${item.origin}')" style="background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 0.65rem; cursor: pointer;">NF/Boleto</button>
                 <button type="button" class="btn btn-sm" onclick="${reopenClick}" style="background: #f8fafc; color: #64748b; border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 0.65rem; cursor: pointer;">Reabrir</button>`
              : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
window.renderClientBillingTable = renderClientBillingTable;

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
  if (selected.length === 0) {
    showToast('Selecione pelo menos um lançamento para dar baixa.', 'warning');
    return;
  }

  const flowIds = [];
  const storeIds = [];
  selected.forEach(cb => {
    const id = parseInt(cb.getAttribute('data-id'), 10);
    const orig = cb.getAttribute('data-origin') || 'flow';
    if (orig === 'store') storeIds.push(id);
    else flowIds.push(id);
  });

  try {
    if (flowIds.length > 0) {
      await fetch('/api/billing/shipments/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment_ids: flowIds, payment_status: targetStatus })
      });
    }
    if (storeIds.length > 0) {
      await Promise.all(storeIds.map(id =>
        fetch(`/api/store/orders/${id}/payment-status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_status: targetStatus })
        })
      ));
    }

    showToast('Status financeiro atualizado para os lançamentos selecionados!', 'success');

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

/* ==========================================================================
   CATEGORIAS MÃE DO MENU LATERAL (FLOW & LOJA VIRTUAL)
   ========================================================================== */
function toggleMenuCategory(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.classList.toggle('collapsed');
}
window.toggleMenuCategory = toggleMenuCategory;

/* ==========================================================================
   MÓDULO LOJA VIRTUAL B2B (ADMIN & CLIENTE - SEM POPUPS / MODAIS)
   ========================================================================== */

let storeProductFormReturnTab = 'tab-admin-store-settings';
let currentStoreProductGallery = [];
let currentClientStoreConfig = null;
let allStoreCatalogProducts = [];
let selectedTierByProduct = {}; // { [productId]: 20 | 50 | 100 | 200 | 500 | 1000 }
let storeCartState = { items: [], subtotal: 0, total_pieces: 0, payment_methods: ['30 DIAS BOLETO'] };
let selectedStoreDeliveryType = 'flow'; // 'flow' ou 'normal'
let selectedStorePaymentMethod = '30 DIAS BOLETO';
let selectedStoreFreightQuote = null;
let allAdminStoreOrders = [];
let allStoreBillingOrders = [];
let allAdminStoreProducts = [];

function formatCurrencyBR(val) {
  const num = parseFloat(val) || 0;
  return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// --------------------------------------------------------------------------
// 1. GESTÃO DA LOJA DO CLIENTE (DENTRO DE GERENCIAR CLIENTE - ADMIN)
// --------------------------------------------------------------------------

async function loadClientStoreAdmin(clientId) {
  if (!clientId) return;
  const badgeEl = document.getElementById('client-store-badge');
  const btnToggle = document.getElementById('btn-toggle-client-store');
  const titleEl = document.getElementById('client-store-status-title');
  const tbody = document.getElementById('client-store-products-tbody');

  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 1.5rem;">Carregando catálogo da loja...</td></tr>';
  }

  try {
    const [cfgRes, prodRes] = await Promise.all([
      fetch(`/api/store/client-config/${clientId}`),
      fetch(`/api/store/products?client_id=${clientId}`)
    ]);

    const cfg = await cfgRes.json();
    const prods = await prodRes.json();
    currentClientStoreConfig = cfg;

    if (titleEl && cfg.client_name) {
      titleEl.textContent = `Loja Corporativa — ${cfg.client_name}`;
    }

    if (badgeEl) {
      if (cfg.is_enabled) {
        badgeEl.className = 'badge badge-success';
        badgeEl.textContent = 'Loja Ativa';
      } else {
        badgeEl.className = 'badge badge-secondary';
        badgeEl.textContent = cfg.has_store ? 'Loja Inativa' : 'Não Ativada';
      }
    }

    if (btnToggle) {
      btnToggle.textContent = cfg.is_enabled ? 'Desativar Loja deste Cliente' : 'Criar / Ativar Loja para este Cliente';
    }

    renderClientPaymentMethodsTags();

    if (tbody) {
      if (!prods || prods.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum produto cadastrado na loja deste cliente. Clique em "Cadastrar Produto na Loja" acima para adicionar.</td></tr>';
      } else {
        tbody.innerHTML = prods.map(p => {
          const img = (p.images && p.images[0]) || p.image_url || '/images/logow2.png';
          return `
            <tr>
              <td>
                <img src="${escapeHtml(img)}" alt="${escapeHtml(p.name)}" style="width: 42px; height: 42px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-color);">
              </td>
              <td style="font-weight: 700; font-family: monospace;">${escapeHtml(p.code)}</td>
              <td>
                <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(p.name)}</div>
                <div style="font-size: 0.78rem; color: var(--text-muted); max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.description || '')}</div>
              </td>
              <td><span class="badge badge-secondary" style="font-size: 0.76rem;">${p.production_days || 7} dias</span></td>
              <td>${formatCurrencyBR(p.price_20)}</td>
              <td>${formatCurrencyBR(p.price_50)}</td>
              <td>${formatCurrencyBR(p.price_100)}</td>
              <td>${formatCurrencyBR(p.price_200)}</td>
              <td>${formatCurrencyBR(p.price_500)}</td>
              <td>${formatCurrencyBR(p.price_1000)}</td>
              <td>
                <div style="display: flex; gap: 0.4rem;">
                  <button type="button" class="btn btn-secondary btn-sm" onclick="openEditStoreProduct(${p.id}, 'page-client-detail')">Editar</button>
                  <button type="button" class="btn btn-secondary btn-sm" style="color: #ef4444; border-color: #fecaca;" onclick="deleteStoreProduct(${p.id}, ${clientId})">Excluir</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Erro ao carregar loja do cliente:', err);
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="11" style="color: #ef4444; text-align: center; padding: 1.5rem;">Erro ao carregar produtos da loja.</td></tr>';
    }
  }
}
window.loadClientStoreAdmin = loadClientStoreAdmin;

async function toggleClientStoreStatus() {
  if (!activeManagingClientId) return;
  const nextState = !(currentClientStoreConfig && currentClientStoreConfig.is_enabled);

  try {
    const res = await fetch(`/api/store/client-config/${activeManagingClientId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_enabled: nextState ? 1 : 0,
        store_title: currentClientStoreConfig ? currentClientStoreConfig.store_title : ''
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar status da loja.');

    if (typeof showToast === 'function') showToast(data.message, 'success');
    await loadClientStoreAdmin(activeManagingClientId);
  } catch (err) {
    alert(err.message);
  }
}
window.toggleClientStoreStatus = toggleClientStoreStatus;

function renderClientPaymentMethodsTags() {
  const container = document.getElementById('client-store-payment-methods-tags');
  if (!container) return;

  const methods = (currentClientStoreConfig && Array.isArray(currentClientStoreConfig.payment_methods) && currentClientStoreConfig.payment_methods.length > 0)
    ? currentClientStoreConfig.payment_methods
    : ['30 DIAS BOLETO'];

  container.innerHTML = methods.map((m, idx) => `
    <span style="display: inline-flex; align-items: center; gap: 0.45rem; background: #f5f3ff; border: 1px solid #ddd6fe; color: #59338f; font-size: 0.8rem; font-weight: 700; padding: 0.35rem 0.7rem; border-radius: 6px;">
      <span>${escapeHtml(m)}</span>
      <button type="button" onclick="removeClientPaymentMethod(${idx})" title="Remover esta opção de pagamento" style="background: none; border: none; color: #59338f; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 2px; opacity: 0.75;">&times;</button>
    </span>
  `).join('');
}

async function saveClientPaymentMethodsConfig(updatedMethods) {
  if (!activeManagingClientId) return;
  try {
    const res = await fetch(`/api/store/client-config/${activeManagingClientId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_enabled: currentClientStoreConfig && currentClientStoreConfig.is_enabled ? 1 : 0,
        store_title: currentClientStoreConfig ? currentClientStoreConfig.store_title : '',
        payment_methods: updatedMethods
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar meios de pagamento.');

    if (currentClientStoreConfig) {
      currentClientStoreConfig.payment_methods = data.payment_methods || updatedMethods;
    }
    renderClientPaymentMethodsTags();
    if (typeof showToast === 'function') showToast('Meios de pagamento do cliente atualizados!', 'success');
  } catch (err) {
    alert(err.message);
  }
}

async function addClientPaymentMethod(presetVal) {
  if (!activeManagingClientId) return;
  const input = document.getElementById('input-new-client-payment-method');
  const rawVal = presetVal ? String(presetVal) : (input ? input.value : '');
  const cleanVal = rawVal.trim().toUpperCase();
  if (!cleanVal) return;

  const currentList = (currentClientStoreConfig && Array.isArray(currentClientStoreConfig.payment_methods))
    ? [...currentClientStoreConfig.payment_methods]
    : ['30 DIAS BOLETO'];

  if (!currentList.includes(cleanVal)) {
    currentList.push(cleanVal);
  }
  if (!presetVal && input) {
    input.value = '';
  }

  await saveClientPaymentMethodsConfig(currentList);
}
window.addClientPaymentMethod = addClientPaymentMethod;

async function removeClientPaymentMethod(idx) {
  if (!activeManagingClientId) return;
  const currentList = (currentClientStoreConfig && Array.isArray(currentClientStoreConfig.payment_methods))
    ? [...currentClientStoreConfig.payment_methods]
    : ['30 DIAS BOLETO'];

  if (currentList.length <= 1) {
    alert('O cliente precisa ter pelo menos 1 condição de faturamento cadastrada.');
    return;
  }

  currentList.splice(idx, 1);
  await saveClientPaymentMethodsConfig(currentList);
}
window.removeClientPaymentMethod = removeClientPaymentMethod;

// --------------------------------------------------------------------------
// 2. FORMULÁRIO DEDICADO DE PRODUTO DA LOJA (SEM POPUP)
// --------------------------------------------------------------------------

async function populateStoreProductClientSelect(selectedClientId) {
  const select = document.getElementById('store-prod-client-select');
  if (!select) return;

  try {
    const res = await fetch('/api/clients');
    const clients = await res.json();
    const clientList = Array.isArray(clients) ? clients.filter(c => c.role === 'client') : [];

    select.innerHTML = '<option value="">Selecione o cliente...</option>' +
      clientList.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.email)})</option>`).join('');

    if (selectedClientId) {
      select.value = String(selectedClientId);
    }
  } catch (e) {
    console.error('Erro ao popular clientes da loja:', e);
  }
}

function openNewStoreProductForClient() {
  openStoreProductForm(null, activeManagingClientId, 'page-client-detail');
}
window.openNewStoreProductForClient = openNewStoreProductForClient;

function openNewStoreProductGlobal(preselectedClientId) {
  openStoreProductForm(null, preselectedClientId || null, 'tab-admin-store-settings');
}
window.openNewStoreProductGlobal = openNewStoreProductGlobal;

async function openStoreProductForm(productData, targetClientId, returnTab) {
  storeProductFormReturnTab = returnTab || 'tab-admin-store-settings';
  const backLabel = document.getElementById('store-product-form-back-label');
  if (backLabel) {
    backLabel.textContent = storeProductFormReturnTab === 'page-client-detail'
      ? 'Voltar para Gerenciar Cliente'
      : 'Voltar para Loja & Configurações';
  }

  const form = document.getElementById('form-store-product');
  if (form) form.reset();

  await populateStoreProductClientSelect(targetClientId || (productData ? productData.client_id : null));

  const titleEl = document.getElementById('store-product-form-title');
  if (productData) {
    if (titleEl) titleEl.textContent = `Editar Produto da Loja: ${productData.name}`;
    document.getElementById('store-prod-id').value = productData.id;
    document.getElementById('store-prod-client-select').value = String(productData.client_id || '');
    document.getElementById('store-prod-code').value = productData.code || '';
    document.getElementById('store-prod-name').value = productData.name || '';
    if (document.getElementById('store-prod-production-days')) {
      document.getElementById('store-prod-production-days').value = productData.production_days || 7;
    }
    document.getElementById('store-prod-description').value = productData.description || '';
    document.getElementById('store-price-20').value = productData.price_20 || 0;
    document.getElementById('store-price-50').value = productData.price_50 || 0;
    document.getElementById('store-price-100').value = productData.price_100 || 0;
    document.getElementById('store-price-200').value = productData.price_200 || 0;
    document.getElementById('store-price-500').value = productData.price_500 || 0;
    document.getElementById('store-price-1000').value = productData.price_1000 || 0;

    document.getElementById('store-unit-weight').value = productData.unit_weight || 0.3;
    document.getElementById('store-max-qty-box').value = productData.max_qty_per_box || 20;
    document.getElementById('store-box-height').value = productData.box_height || 30;
    document.getElementById('store-box-width').value = productData.box_width || 40;
    document.getElementById('store-box-length').value = productData.box_length || 40;

    currentStoreProductGallery = Array.isArray(productData.images) && productData.images.length > 0
      ? [...productData.images]
      : (productData.image_url ? [productData.image_url] : []);
  } else {
    if (titleEl) titleEl.textContent = 'Cadastrar Produto na Loja do Cliente';
    document.getElementById('store-prod-id').value = '';
    document.getElementById('store-prod-code').value = 'LJ-' + Math.floor(1000 + Math.random() * 9000);
    if (document.getElementById('store-prod-production-days')) {
      document.getElementById('store-prod-production-days').value = 7;
    }
    currentStoreProductGallery = [];
  }

  renderStoreProductGalleryPreview();
  updateStoreTierPreview();
  switchTab('page-store-product-form');
}
window.openStoreProductForm = openStoreProductForm;

async function openEditStoreProduct(productId, returnTab) {
  try {
    const res = await fetch('/api/store/products');
    const prods = await res.json();
    const found = (prods || []).find(p => p.id === productId);
    if (!found) {
      alert('Produto não encontrado.');
      return;
    }
    openStoreProductForm(found, found.client_id, returnTab || 'tab-admin-store-settings');
  } catch (err) {
    alert('Erro ao carregar dados do produto.');
  }
}
window.openEditStoreProduct = openEditStoreProduct;

function closeStoreProductForm() {
  switchTab(storeProductFormReturnTab || 'tab-admin-store-settings');
  if (storeProductFormReturnTab === 'page-client-detail' && activeManagingClientId) {
    switchClientDetailTab('store');
    loadClientStoreAdmin(activeManagingClientId);
  }
}
window.closeStoreProductForm = closeStoreProductForm;

function updateStoreTierPreview() {
  const tiers = [20, 50, 100, 200, 500, 1000];
  tiers.forEach(t => {
    const input = document.getElementById(`store-price-${t}`);
    const preview = document.getElementById(`store-total-preview-${t}`);
    if (input && preview) {
      const unitVal = parseFloat(input.value) || 0;
      const totalVal = unitVal * t;
      preview.textContent = `Lote: ${formatCurrencyBR(totalVal)}`;
    }
  });
}
window.updateStoreTierPreview = updateStoreTierPreview;

function renderStoreProductGalleryPreview() {
  const container = document.getElementById('store-prod-gallery-preview');
  if (!container) return;

  if (!currentStoreProductGallery || currentStoreProductGallery.length === 0) {
    container.innerHTML = '<span style="font-size: 0.82rem; color: var(--text-muted);">Nenhuma foto adicionada ainda.</span>';
    return;
  }

  container.innerHTML = currentStoreProductGallery.map((url, idx) => `
    <div style="position: relative; width: 76px; height: 76px; border-radius: 8px; border: 1px solid var(--border-color); overflow: hidden; background: #fff;">
      <img src="${escapeHtml(url)}" alt="Foto ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover;">
      <button type="button" onclick="removeStoreProductGalleryImage(${idx})" title="Remover foto" style="position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; border-radius: 50%; background: rgba(15,23,42,0.75); color: #fff; border: none; font-size: 12px; line-height: 1; cursor: pointer;">&times;</button>
    </div>
  `).join('');
}

function removeStoreProductGalleryImage(idx) {
  currentStoreProductGallery.splice(idx, 1);
  renderStoreProductGalleryPreview();
}
window.removeStoreProductGalleryImage = removeStoreProductGalleryImage;

function addStoreImageUrlManual() {
  const input = document.getElementById('store-prod-image-url');
  if (!input || !input.value.trim()) return;
  currentStoreProductGallery.push(input.value.trim());
  input.value = '';
  renderStoreProductGalleryPreview();
}
window.addStoreImageUrlManual = addStoreImageUrlManual;

async function uploadStoreProductImages(fileInput) {
  if (!fileInput.files || fileInput.files.length === 0) return;
  const formData = new FormData();
  Array.from(fileInput.files).forEach(f => formData.append('images', f));

  try {
    const res = await fetch('/api/store/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro no upload das fotos.');

    if (Array.isArray(data.urls)) {
      currentStoreProductGallery.push(...data.urls);
    } else if (data.imageUrl) {
      currentStoreProductGallery.push(data.imageUrl);
    }
    fileInput.value = '';
    renderStoreProductGalleryPreview();
    if (typeof showToast === 'function') showToast('Fotos enviadas com sucesso!', 'success');
  } catch (err) {
    alert(err.message);
  }
}
window.uploadStoreProductImages = uploadStoreProductImages;

async function submitStoreProductForm(event) {
  event.preventDefault();

  const prodId = document.getElementById('store-prod-id').value;
  const clientId = document.getElementById('store-prod-client-select').value;
  const code = document.getElementById('store-prod-code').value.trim();
  const name = document.getElementById('store-prod-name').value.trim();
  const description = document.getElementById('store-prod-description').value.trim();

  const manualUrlInput = document.getElementById('store-prod-image-url');
  if (manualUrlInput && manualUrlInput.value.trim()) {
    currentStoreProductGallery.push(manualUrlInput.value.trim());
    manualUrlInput.value = '';
  }

  const payload = {
    client_id: parseInt(clientId, 10),
    code,
    name,
    description,
    image_url: currentStoreProductGallery[0] || '',
    images: currentStoreProductGallery,
    price_20: parseFloat(document.getElementById('store-price-20').value) || 0,
    price_50: parseFloat(document.getElementById('store-price-50').value) || 0,
    price_100: parseFloat(document.getElementById('store-price-100').value) || 0,
    price_200: parseFloat(document.getElementById('store-price-200').value) || 0,
    price_500: parseFloat(document.getElementById('store-price-500').value) || 0,
    price_1000: parseFloat(document.getElementById('store-price-1000').value) || 0,
    unit_weight: parseFloat(document.getElementById('store-unit-weight').value) || 0.3,
    max_qty_per_box: parseInt(document.getElementById('store-max-qty-box').value, 10) || 20,
    box_height: parseFloat(document.getElementById('store-box-height').value) || 30,
    box_width: parseFloat(document.getElementById('store-box-width').value) || 40,
    box_length: parseFloat(document.getElementById('store-box-length').value) || 40,
    production_days: parseInt(document.getElementById('store-prod-production-days')?.value, 10) || 7
  };

  try {
    const url = prodId ? `/api/store/products/${prodId}` : '/api/store/products';
    const method = prodId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar produto da loja.');

    if (typeof showToast === 'function') showToast(data.message, 'success');
    closeStoreProductForm();
  } catch (err) {
    alert(err.message);
  }
}
window.submitStoreProductForm = submitStoreProductForm;

async function deleteStoreProduct(prodId, clientId) {
  if (!confirm('Deseja realmente remover este produto da loja?')) return;
  try {
    const res = await fetch(`/api/store/products/${prodId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao remover produto.');

    if (typeof showToast === 'function') showToast(data.message, 'success');
    if (clientId && activeManagingClientId === clientId) {
      loadClientStoreAdmin(clientId);
    }
    loadAdminAllStoreProducts();
    loadAdminStoreOverview();
  } catch (err) {
    alert(err.message);
  }
}
window.deleteStoreProduct = deleteStoreProduct;

// --------------------------------------------------------------------------
// 3. VITRINE DA LOJA VIRTUAL & PÁGINA DE DETALHES (VISÃO CLIENTE)
// --------------------------------------------------------------------------

async function loadStoreCatalog() {
  const grid = document.getElementById('store-catalog-grid');
  if (!grid) return;

  grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">Carregando produtos da sua loja...</div>';

  try {
    const res = await fetch('/api/store/products');
    const prods = await res.json();
    allStoreCatalogProducts = Array.isArray(prods) ? prods : [];

    allStoreCatalogProducts.forEach(p => {
      if (!selectedTierByProduct[p.id]) {
        selectedTierByProduct[p.id] = 20;
      }
    });

    renderStoreCatalogGrid(allStoreCatalogProducts);
  } catch (err) {
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #ef4444;">Erro ao carregar vitrine da loja.</div>';
  }
}
window.loadStoreCatalog = loadStoreCatalog;

function filterStoreCatalog() {
  const q = (document.getElementById('search-store-catalog')?.value || '').toLowerCase().trim();
  if (!q) {
    renderStoreCatalogGrid(allStoreCatalogProducts);
    return;
  }
  const filtered = allStoreCatalogProducts.filter(p =>
    (p.name && p.name.toLowerCase().includes(q)) ||
    (p.code && p.code.toLowerCase().includes(q)) ||
    (p.description && p.description.toLowerCase().includes(q))
  );
  renderStoreCatalogGrid(filtered);
}
window.filterStoreCatalog = filterStoreCatalog;

function getStoreTierPriceJS(product, qtyInput) {
  const qty = parseInt(qtyInput, 10) || 1;
  const p20 = parseFloat(product.price_20) || 0;
  const p50 = parseFloat(product.price_50) || p20;
  const p100 = parseFloat(product.price_100) || p50;
  const p200 = parseFloat(product.price_200) || p100;
  const p500 = parseFloat(product.price_500) || p200;
  const p1000 = parseFloat(product.price_1000) || p500;

  if (qty >= 1000) return p1000;
  if (qty >= 500) return p500;
  if (qty >= 200) return p200;
  if (qty >= 100) return p100;
  if (qty >= 50) return p50;
  return p20;
}

function renderStoreCatalogGrid(products) {
  const grid = document.getElementById('store-catalog-grid');
  if (!grid) return;

  if (!products || products.length === 0) {
    grid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 0.5rem;">Nenhum produto disponível na sua Loja Virtual no momento</h3>
        <p style="color: var(--text-muted); font-size: 0.88rem;">Assim que os layouts dos seus novos produtos forem aprovados, eles aparecerão aqui prontos para pedido.</p>
      </div>
    `;
    return;
  }

  const tiers = [20, 50, 100, 200, 500, 1000];

  grid.innerHTML = products.map(p => {
    const activeTier = selectedTierByProduct[p.id] || 20;
    const unitPrice = getStoreTierPriceJS(p, activeTier);
    const totalLot = unitPrice * activeTier;
    const mainImg = (p.images && p.images[0]) || p.image_url || '/images/logow2.png';

    const pillsHtml = tiers.map(t => {
      const tPrice = getStoreTierPriceJS(p, t);
      const isSelected = t === activeTier;
      return `
        <button type="button" class="store-tier-pill ${isSelected ? 'active' : ''}" onclick="selectCatalogProductTier(${p.id}, ${t})">
          <span>${t} pçs</span>
          <small>${formatCurrencyBR(tPrice)}/un</small>
        </button>
      `;
    }).join('');

    return `
      <div class="card" style="display: flex; flex-direction: column; justify-content: space-between; padding: 1.25rem; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
        <div>
          <div onclick="openStoreProductDetailPage(${p.id})" style="cursor: pointer; height: 190px; background: #f8fafc; border-radius: 8px; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 1rem;">
            <img src="${escapeHtml(mainImg)}" alt="${escapeHtml(p.name)}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <span style="font-size: 0.75rem; font-family: monospace; color: var(--text-muted); font-weight: 700;">${escapeHtml(p.code)}</span>
            <button type="button" onclick="openStoreProductDetailPage(${p.id})" style="background: none; border: none; color: var(--primary); font-size: 0.78rem; font-weight: 700; cursor: pointer; text-decoration: underline;">Ver detalhes e fotos</button>
          </div>

          <h3 onclick="openStoreProductDetailPage(${p.id})" style="font-size: 1.05rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.35rem; cursor: pointer;">${escapeHtml(p.name)}</h3>
          <div style="margin-bottom: 0.45rem;">
            <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.74rem; font-weight: 700; color: #59338f; background: #f5f3ff; border: 1px solid #ddd6fe; padding: 2px 8px; border-radius: 6px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>Prazo de produção: ${p.production_days || 7} dias</span>
            </span>
          </div>
          <p style="font-size: 0.83rem; color: var(--text-secondary); line-height: 1.5; margin-bottom: 0.75rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(p.description || 'Produto personalizado com layout aprovado.')}
          </p>

          <div style="font-size: 0.76rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Selecione a Quantidade:</div>
          <div class="store-tier-pills">
            ${pillsHtml}
          </div>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 0.85rem; margin-top: 0.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.75rem;">
            <div>
              <span style="font-size: 0.78rem; color: var(--text-muted); display: block;">Valor Unitário (${activeTier} pçs)</span>
              <strong style="font-size: 1rem; color: var(--text-primary);">${formatCurrencyBR(unitPrice)}</strong>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 0.78rem; color: var(--text-muted); display: block;">Total do Lote</span>
              <strong style="font-size: 1.15rem; color: var(--primary); font-weight: 800;">${formatCurrencyBR(totalLot)}</strong>
            </div>
          </div>

          <button type="button" class="btn btn-primary" onclick="addStoreProductToCart(${p.id})" style="width: 100%; font-weight: 700; padding: 0.65rem;">
            Adicionar ao Carrinho (${activeTier} pçs)
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function selectCatalogProductTier(productId, tier) {
  selectedTierByProduct[productId] = tier;
  filterStoreCatalog();
}
window.selectCatalogProductTier = selectCatalogProductTier;

function openStoreProductDetailPage(productId) {
  const product = allStoreCatalogProducts.find(p => p.id === productId);
  if (!product) return;

  const activeTier = selectedTierByProduct[product.id] || 20;
  const unitPrice = getStoreTierPriceJS(product, activeTier);
  const totalLot = unitPrice * activeTier;
  const images = (product.images && product.images.length > 0) ? product.images : (product.image_url ? [product.image_url] : ['/images/logow2.png']);
  const tiers = [20, 50, 100, 200, 500, 1000];

  const container = document.getElementById('store-product-detail-container');
  if (!container) return;

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: minmax(280px, 420px) 1fr; gap: 2rem; align-items: start;">
      <div>
        <div style="height: 340px; background: #f8fafc; border: 1px solid var(--border-color); border-radius: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 0.85rem;">
          <img id="store-detail-main-img" src="${escapeHtml(images[0])}" alt="${escapeHtml(product.name)}" style="max-width: 100%; max-height: 100%; object-fit: contain;">
        </div>
        <div style="display: flex; gap: 0.6rem; flex-wrap: wrap;">
          ${images.map((imgUrl) => `
            <div onclick="document.getElementById('store-detail-main-img').src='${escapeHtml(imgUrl)}'" style="width: 64px; height: 64px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; cursor: pointer; background: #fff;">
              <img src="${escapeHtml(imgUrl)}" style="width: 100%; height: 100%; object-fit: cover;">
            </div>
          `).join('')}
        </div>
      </div>

      <div>
        <span style="font-family: monospace; font-size: 0.82rem; color: var(--text-muted); font-weight: 700;">CÓDIGO: ${escapeHtml(product.code)}</span>
        <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin: 0.25rem 0 0.65rem 0;">${escapeHtml(product.name)}</h2>

        <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: #f5f3ff; border: 1px solid #ddd6fe; color: #59338f; padding: 0.45rem 0.85rem; border-radius: 8px; font-size: 0.84rem; font-weight: 700; margin-bottom: 1.15rem;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span>Prazo de Produção: <strong>${product.production_days || 7} dias</strong> (Pronto em aprox. ${new Date(Date.now() + (product.production_days || 7) * 86400000).toLocaleDateString('pt-BR')})</span>
        </div>

        <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem;">
          <h4 style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem;">Descrição e Especificações do Produto</h4>
          <p style="font-size: 0.92rem; color: var(--text-secondary); line-height: 1.65; white-space: pre-line; margin: 0;">${escapeHtml(product.description || 'Sem descrição adicional.')}</p>
        </div>

        <h4 style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.5rem;">Tabela de Preços por Tiragem (Escolha a quantidade):</h4>
        <div class="store-tier-pills" style="grid-template-columns: repeat(6, 1fr); margin-bottom: 1.5rem;">
          ${tiers.map(t => {
            const tPrice = getStoreTierPriceJS(product, t);
            const isSel = t === activeTier;
            return `
              <button type="button" class="store-tier-pill ${isSel ? 'active' : ''}" onclick="selectedTierByProduct[${product.id}]=${t}; openStoreProductDetailPage(${product.id});">
                <span>${t} pçs</span>
                <small>${formatCurrencyBR(tPrice)}/un</small>
              </button>
            `;
          }).join('')}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--primary-light); border: 1px solid var(--primary); border-radius: 10px; padding: 1.25rem; margin-bottom: 1.25rem;">
          <div>
            <span style="font-size: 0.82rem; color: var(--text-secondary); display: block;">Tiragem Selecionada: <strong>${activeTier} peças</strong></span>
            <span style="font-size: 0.9rem; color: var(--text-primary);">Valor Unitário: <strong>${formatCurrencyBR(unitPrice)}</strong></span>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 0.8rem; color: var(--text-secondary); display: block;">Total para ${activeTier} pçs</span>
            <strong style="font-size: 1.4rem; color: var(--primary); font-weight: 800;">${formatCurrencyBR(totalLot)}</strong>
          </div>
        </div>

        <div style="display: flex; gap: 1rem;">
          <button type="button" class="btn btn-primary" onclick="addStoreProductToCart(${product.id}, true)" style="flex: 1; padding: 0.85rem; font-size: 0.95rem; font-weight: 800;">
            Adicionar ${activeTier} pçs ao Carrinho da Loja
          </button>
        </div>
      </div>
    </div>
  `;

  switchTab('page-store-product-detail');
}
window.openStoreProductDetailPage = openStoreProductDetailPage;

// --------------------------------------------------------------------------
// 4. CARRINHO DA LOJA & CHECKOUT (ENVIO FLOW vs ENVIO NORMAL)
// --------------------------------------------------------------------------

async function addStoreProductToCart(productId, goToCart = false) {
  const tier = selectedTierByProduct[productId] || 20;
  try {
    const res = await fetch('/api/store/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_product_id: productId, tier_qty: tier })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao adicionar ao carrinho.');

    if (typeof showToast === 'function') showToast(data.message, 'success');
    await loadStoreCart();
    if (goToCart) {
      switchTab('tab-store-cart');
    }
  } catch (err) {
    alert(err.message);
  }
}
window.addStoreProductToCart = addStoreProductToCart;

async function loadStoreCart() {
  try {
    const res = await fetch('/api/store/cart');
    const data = await res.json();
    const methods = (data && Array.isArray(data.payment_methods) && data.payment_methods.length > 0)
      ? data.payment_methods
      : ['30 DIAS BOLETO'];
    storeCartState = data && Array.isArray(data.items)
      ? { ...data, payment_methods: methods }
      : { items: [], subtotal: 0, total_pieces: 0, payment_methods: methods };

    if (!selectedStorePaymentMethod || !methods.includes(selectedStorePaymentMethod)) {
      selectedStorePaymentMethod = methods[0];
    }

    const count = storeCartState.items.length;
    const sidebarBadge = document.getElementById('sidebar-store-cart-badge');
    const catalogBadge = document.getElementById('store-catalog-cart-badge');

    if (sidebarBadge) {
      sidebarBadge.textContent = count;
      sidebarBadge.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (catalogBadge) {
      catalogBadge.textContent = count;
    }

    renderStoreCartTable();
    renderStoreCartPaymentMethods();
    if (typeof loadNetworkBillingOptions === 'function') {
      await loadNetworkBillingOptions('store-checkout-billing-select');
    }
    updateStoreCheckoutTotals();
  } catch (err) {
    console.error('Erro ao carregar carrinho da loja:', err);
  }
}
window.loadStoreCart = loadStoreCart;

function renderStoreCartPaymentMethods() {
  const listEl = document.getElementById('store-cart-payment-methods-list');
  if (!listEl) return;

  const methods = (storeCartState && Array.isArray(storeCartState.payment_methods) && storeCartState.payment_methods.length > 0)
    ? storeCartState.payment_methods
    : ['30 DIAS BOLETO'];

  if (!selectedStorePaymentMethod || !methods.includes(selectedStorePaymentMethod)) {
    selectedStorePaymentMethod = methods[0];
  }

  listEl.innerHTML = methods.map((m, idx) => {
    const isSel = selectedStorePaymentMethod === m;
    return `
      <div onclick="selectStorePaymentMethodByIndex(${idx})" style="border: 2px solid ${isSel ? 'var(--primary)' : 'var(--border-color)'}; background: ${isSel ? 'var(--primary-light)' : '#ffffff'}; border-radius: 10px; padding: 0.95rem 1.15rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; transition: all 0.15s ease;">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
          <div style="width: 18px; height: 18px; border-radius: 50%; border: 2px solid ${isSel ? 'var(--primary)' : '#94a3b8'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            ${isSel ? '<div style="width: 9px; height: 9px; border-radius: 50%; background: var(--primary);"></div>' : ''}
          </div>
          <div>
            <div style="font-weight: 800; font-size: 0.92rem; color: var(--text-primary);">${escapeHtml(m)}</div>
            <div style="font-size: 0.76rem; color: var(--text-muted);">Condição liberada para sua empresa</div>
          </div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${isSel ? 'var(--primary)' : '#94a3b8'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
      </div>
    `;
  }).join('');
}

function selectStorePaymentMethodByIndex(idx) {
  const methods = (storeCartState && Array.isArray(storeCartState.payment_methods) && storeCartState.payment_methods.length > 0)
    ? storeCartState.payment_methods
    : ['30 DIAS BOLETO'];
  if (!methods[idx]) return;
  selectedStorePaymentMethod = methods[idx];
  renderStoreCartPaymentMethods();
  updateStoreCheckoutTotals();
}
window.selectStorePaymentMethodByIndex = selectStorePaymentMethodByIndex;

function renderStoreCartTable() {
  const tbody = document.getElementById('store-cart-tbody');
  if (!tbody) return;

  if (!storeCartState.items || storeCartState.items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">Seu carrinho da loja está vazio. Acesse a Vitrine da Loja para escolher seus produtos.</td></tr>';
    return;
  }

  const tiers = [20, 50, 100, 200, 500, 1000];

  tbody.innerHTML = storeCartState.items.map(item => {
    const img = item.image_url || '/images/logow2.png';
    const isStandardTier = tiers.includes(item.tier_qty);
    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <img src="${escapeHtml(img)}" style="width: 46px; height: 46px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-color);">
            <div>
              <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(item.name)}</div>
              <div style="font-size: 0.76rem; color: var(--text-muted); font-family: monospace;">${escapeHtml(item.code)} • <span style="color: var(--primary); font-family: inherit; font-weight: 700;">Prazo: ${item.production_days || 7} dias</span></div>
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <select onchange="changeStoreCartItemTier(${item.cart_item_id}, this.value)" title="Selecionar tiragem padrão" style="padding: 0.45rem 0.65rem; border: 1px solid var(--border-color); border-radius: 6px; font-weight: 700; background: #fff;">
              ${!isStandardTier ? `<option value="${item.tier_qty}" selected>Personalizado (${item.tier_qty} pçs)</option>` : ''}
              ${tiers.map(t => `<option value="${t}" ${t === item.tier_qty ? 'selected' : ''}>Lote ${t} pçs</option>`).join('')}
            </select>
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              <input type="number" id="cart-custom-qty-${item.cart_item_id}" min="1" value="${item.tier_qty}" 
                     placeholder="Ex: 22" 
                     title="Digite a quantidade exata desejada (ex: 22 peças)"
                     onkeydown="if(event.key==='Enter'){ event.preventDefault(); changeStoreCartItemTier(${item.cart_item_id}, this.value); }"
                     style="width: 82px; padding: 0.45rem 0.55rem; border: 1px solid var(--border-color); border-radius: 6px; font-weight: 700; text-align: center;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="changeStoreCartItemTier(${item.cart_item_id}, document.getElementById('cart-custom-qty-${item.cart_item_id}').value)" style="padding: 0.45rem 0.65rem; font-size: 0.76rem; font-weight: 700;">
                Aplicar Qtd
              </button>
            </div>
          </div>
          <small style="display: block; color: var(--text-muted); font-size: 0.73rem; margin-top: 0.25rem;">Escolha o lote ou digite a quantidade exata (ex: 22 pçs)</small>
        </td>
        <td style="font-weight: 600;">${formatCurrencyBR(item.unit_price)} / un</td>
        <td style="font-weight: 800; color: var(--primary);">${formatCurrencyBR(item.total_price)}</td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm" style="color: #ef4444; border-color: #fecaca;" onclick="removeStoreCartItem(${item.cart_item_id})">Remover</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function changeStoreCartItemTier(cartItemId, newTier) {
  const parsed = parseInt(newTier, 10);
  if (isNaN(parsed) || parsed < 1) {
    alert('Informe uma quantidade válida (mínimo 1 peça).');
    return;
  }
  try {
    const res = await fetch(`/api/store/cart/${cartItemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier_qty: parsed })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Erro ao atualizar quantidade.');
      return;
    }
    selectedStoreFreightQuote = null;
    await loadStoreCart();
    if (typeof showToast === 'function') showToast(`Quantidade atualizada para ${parsed} peças.`, 'success');
    if (selectedStoreDeliveryType === 'normal' && document.getElementById('store-dest-cep')?.value) {
      quoteStoreCartFreight();
    }
  } catch (err) {
    console.error(err);
  }
}
window.changeStoreCartItemTier = changeStoreCartItemTier;

async function removeStoreCartItem(cartItemId) {
  try {
    await fetch(`/api/store/cart/${cartItemId}`, { method: 'DELETE' });
    selectedStoreFreightQuote = null;
    await loadStoreCart();
  } catch (err) {
    console.error(err);
  }
}
window.removeStoreCartItem = removeStoreCartItem;

async function clearStoreCart() {
  if (!storeCartState.items || storeCartState.items.length === 0) return;
  if (!confirm('Deseja limpar todos os produtos do carrinho da loja?')) return;
  try {
    await fetch('/api/store/cart', { method: 'DELETE' });
    selectedStoreFreightQuote = null;
    await loadStoreCart();
  } catch (err) {
    console.error(err);
  }
}
window.clearStoreCart = clearStoreCart;

function selectStoreDeliveryType(type) {
  selectedStoreDeliveryType = type === 'normal' ? 'normal' : 'flow';

  const cardFlow = document.getElementById('card-delivery-flow');
  const cardNormal = document.getElementById('card-delivery-normal');
  const normalSection = document.getElementById('store-normal-shipping-section');

  if (selectedStoreDeliveryType === 'flow') {
    if (cardFlow) {
      cardFlow.style.borderColor = 'var(--primary)';
      cardFlow.style.background = 'var(--primary-light)';
    }
    if (cardNormal) {
      cardNormal.style.borderColor = 'var(--border-color)';
      cardNormal.style.background = '#ffffff';
    }
    if (normalSection) normalSection.classList.add('hidden');
  } else {
    if (cardNormal) {
      cardNormal.style.borderColor = 'var(--primary)';
      cardNormal.style.background = 'var(--primary-light)';
    }
    if (cardFlow) {
      cardFlow.style.borderColor = 'var(--border-color)';
      cardFlow.style.background = '#ffffff';
    }
    if (normalSection) normalSection.classList.remove('hidden');
  }

  updateStoreCheckoutTotals();
}
window.selectStoreDeliveryType = selectStoreDeliveryType;

function updateStoreCheckoutTotals() {
  const subtotal = parseFloat(storeCartState.subtotal) || 0;
  const freight = (selectedStoreDeliveryType === 'normal' && selectedStoreFreightQuote)
    ? (parseFloat(selectedStoreFreightQuote.final_price) || 0)
    : 0;
  const total = subtotal + freight;

  const subEl = document.getElementById('store-checkout-subtotal');
  const prodInfoEl = document.getElementById('store-checkout-production-info');
  const delivEl = document.getElementById('store-checkout-delivery-label');
  const payEl = document.getElementById('store-checkout-payment-label');
  const freightEl = document.getElementById('store-checkout-freight');
  const totalEl = document.getElementById('store-checkout-total');

  if (subEl) subEl.textContent = formatCurrencyBR(subtotal);
  if (prodInfoEl) {
    if (!storeCartState.items || storeCartState.items.length === 0) {
      prodInfoEl.textContent = '-';
    } else {
      const maxDays = storeCartState.items.reduce((m, it) => Math.max(m, parseInt(it.production_days, 10) || 7), 1);
      const readyDateStr = new Date(Date.now() + maxDays * 86400000).toLocaleDateString('pt-BR');
      prodInfoEl.textContent = `${maxDays} dias (Pronto em ${readyDateStr})`;
    }
  }
  if (delivEl) {
    delivEl.textContent = selectedStoreDeliveryType === 'flow'
      ? 'Envio Flow'
      : (selectedStoreFreightQuote ? `${selectedStoreFreightQuote.carrier} (${selectedStoreFreightQuote.service})` : 'Envio Direto (Selecione o frete)');
  }
  if (payEl) {
    payEl.textContent = selectedStorePaymentMethod || '30 DIAS BOLETO';
  }
  const billTargetEl = document.getElementById('store-checkout-billing-target-label');
  if (billTargetEl) {
    const sel = document.getElementById('store-checkout-billing-select');
    const opt = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex] : null;
    if (opt) {
      const bName = opt.getAttribute('data-name') || '';
      const bCnpj = opt.getAttribute('data-cnpj') || '';
      billTargetEl.textContent = bCnpj ? `${bName} (${bCnpj})` : bName;
    } else {
      billTargetEl.textContent = '-';
    }
  }
  if (freightEl) freightEl.textContent = formatCurrencyBR(freight);
  if (totalEl) totalEl.textContent = formatCurrencyBR(total);
}

async function lookupStoreCep(cepVal) {
  const clean = (cepVal || '').replace(/\D/g, '');
  if (clean.length !== 8) return;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = await res.json();
    if (!data.erro) {
      if (data.logradouro) document.getElementById('store-dest-address').value = data.logradouro;
      if (data.bairro) document.getElementById('store-dest-neighborhood').value = data.bairro;
      if (data.localidade) document.getElementById('store-dest-city').value = data.localidade;
      if (data.uf) document.getElementById('store-dest-state').value = data.uf;
      quoteStoreCartFreight();
    }
  } catch (e) {
    console.error('Erro ViaCEP loja:', e);
  }
}
window.lookupStoreCep = lookupStoreCep;

async function fillStoreAddressFromSaved() {
  try {
    const res = await fetch('/api/addresses');
    const addrs = await res.json();
    if (!addrs || addrs.length === 0) {
      alert('Você ainda não possui endereços cadastrados na aba Meus Endereços.');
      return;
    }
    const addr = addrs.find(a => a.is_default) || addrs[0];
    document.getElementById('store-dest-recipient').value = addr.recipient_name || addr.title || '';
    document.getElementById('store-dest-cep').value = addr.cep || '';
    document.getElementById('store-dest-address').value = addr.address || '';
    document.getElementById('store-dest-number').value = addr.number || '';
    document.getElementById('store-dest-complement').value = addr.complement || '';
    document.getElementById('store-dest-neighborhood').value = addr.neighborhood || '';
    document.getElementById('store-dest-city').value = addr.city || '';
    document.getElementById('store-dest-state').value = addr.state || '';
    quoteStoreCartFreight();
  } catch (err) {
    console.error(err);
  }
}
window.fillStoreAddressFromSaved = fillStoreAddressFromSaved;

async function quoteStoreCartFreight() {
  const cep = document.getElementById('store-dest-cep')?.value.trim();
  const listEl = document.getElementById('store-freight-quotes-list');
  if (!listEl) return;

  if (!cep) {
    alert('Informe o CEP de destino para calcular o frete.');
    return;
  }

  listEl.innerHTML = '<div style="padding: 1rem; color: var(--text-muted);">Calculando cubagem dos lotes e cotando transportadoras...</div>';

  try {
    const res = await fetch('/api/store/quote-freight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dest_cep: cep })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao cotar frete.');

    const quotes = data.quotes || [];
    if (quotes.length === 0) {
      listEl.innerHTML = '<div style="padding: 1rem; color: #ef4444;">Nenhuma transportadora disponível para este CEP.</div>';
      return;
    }

    selectedStoreFreightQuote = quotes[0];
    renderStoreFreightQuotes(quotes);
    updateStoreCheckoutTotals();
  } catch (err) {
    listEl.innerHTML = `<div style="padding: 1rem; color: #ef4444;">${escapeHtml(err.message)}</div>`;
  }
}
window.quoteStoreCartFreight = quoteStoreCartFreight;

function renderStoreFreightQuotes(quotes) {
  const listEl = document.getElementById('store-freight-quotes-list');
  if (!listEl) return;

  listEl.innerHTML = quotes.map((q, idx) => {
    const isSel = selectedStoreFreightQuote && selectedStoreFreightQuote.carrier === q.carrier && selectedStoreFreightQuote.service === q.service;
    return `
      <div onclick="selectStoreFreightOption(${idx})" style="border: 2px solid ${isSel ? 'var(--primary)' : 'var(--border-color)'}; background: ${isSel ? 'var(--primary-light)' : '#ffffff'}; border-radius: 8px; padding: 0.9rem 1rem; cursor: pointer; transition: all 0.15s ease;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
          <strong style="color: var(--text-primary); font-size: 0.9rem;">${escapeHtml(q.carrier)} — ${escapeHtml(q.service)}</strong>
          <strong style="color: var(--primary); font-size: 1rem;">${formatCurrencyBR(q.final_price)}</strong>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">Prazo estimado após produção: ${q.delivery_days} dias úteis</div>
      </div>
    `;
  }).join('');

  window._lastStoreQuotes = quotes;
}

function selectStoreFreightOption(idx) {
  if (!window._lastStoreQuotes || !window._lastStoreQuotes[idx]) return;
  selectedStoreFreightQuote = window._lastStoreQuotes[idx];
  renderStoreFreightQuotes(window._lastStoreQuotes);
  updateStoreCheckoutTotals();
}
window.selectStoreFreightOption = selectStoreFreightOption;

async function submitStoreCheckout() {
  if (!storeCartState.items || storeCartState.items.length === 0) {
    alert('Adicione pelo menos um produto ao carrinho da loja antes de finalizar.');
    return;
  }

  const billingSel = document.getElementById('store-checkout-billing-select');
  const selectedBillOpt = billingSel && billingSel.selectedIndex >= 0 ? billingSel.options[billingSel.selectedIndex] : null;

  const payload = {
    delivery_type: selectedStoreDeliveryType,
    payment_method: selectedStorePaymentMethod || '30 DIAS BOLETO',
    billing_client_id: selectedBillOpt ? parseInt(selectedBillOpt.value, 10) : null,
    billing_cnpj: selectedBillOpt ? (selectedBillOpt.getAttribute('data-cnpj') || '') : '',
    billing_name: selectedBillOpt ? (selectedBillOpt.getAttribute('data-name') || '') : '',
    notes: document.getElementById('store-order-notes')?.value.trim() || ''
  };

  if (selectedStoreDeliveryType === 'normal') {
    const recipient = document.getElementById('store-dest-recipient')?.value.trim();
    const cep = document.getElementById('store-dest-cep')?.value.trim();
    const address = document.getElementById('store-dest-address')?.value.trim();
    const number = document.getElementById('store-dest-number')?.value.trim();
    const complement = document.getElementById('store-dest-complement')?.value.trim();
    const neighborhood = document.getElementById('store-dest-neighborhood')?.value.trim();
    const city = document.getElementById('store-dest-city')?.value.trim();
    const state = document.getElementById('store-dest-state')?.value.trim();

    if (!recipient || !cep || !address || !number || !city) {
      alert('Preencha todos os campos obrigatórios do endereço de entrega.');
      return;
    }
    if (!selectedStoreFreightQuote) {
      alert('Realize a cotação e selecione uma opção de frete para o Envio Normal.');
      return;
    }

    payload.recipient_name = recipient;
    payload.dest_cep = cep;
    payload.dest_address = address;
    payload.dest_number = number;
    payload.dest_complement = complement;
    payload.dest_neighborhood = neighborhood;
    payload.dest_city = city;
    payload.dest_state = state;
    payload.selected_carrier = selectedStoreFreightQuote.carrier;
    payload.selected_service = selectedStoreFreightQuote.service;
    payload.freight_price = selectedStoreFreightQuote.final_price;
    payload.delivery_days = selectedStoreFreightQuote.delivery_days;
  }

  const btn = document.getElementById('btn-submit-store-order');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/store/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao finalizar pedido.');

    if (typeof showToast === 'function') showToast(data.message, 'success');
    selectedStoreFreightQuote = null;
    if (document.getElementById('store-order-notes')) document.getElementById('store-order-notes').value = '';
    await loadStoreCart();
    switchTab('tab-store-orders');
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.submitStoreCheckout = submitStoreCheckout;

// --------------------------------------------------------------------------
// 5. MEUS PEDIDOS DA LOJA (CLIENTE), DETALHES DO PEDIDO & PRODUÇÃO (ADMIN)
// --------------------------------------------------------------------------

let allClientStoreOrders = [];
let storeOrderDetailReturnTab = 'tab-store-orders';

function getStoreOrderStatusBadge(status) {
  switch (status) {
    case 'aguardando_aprovacao_mae':
      return `<span style="display: inline-flex; align-items: center; background: transparent; color: #7c3aed; padding: 2px 6px; font-size: 0.85rem; font-weight: 700;">Aguard. Aprovação Matriz</span>`;
    case 'recusado_matriz':
      return `<span style="display: inline-flex; align-items: center; background: transparent; color: #dc2626; padding: 2px 6px; font-size: 0.85rem; font-weight: 700;">Recusado pela Matriz</span>`;
    case 'em_aberto':
      return `<span style="display: inline-flex; align-items: center; background: transparent; color: #d97706; padding: 2px 6px; font-size: 0.85rem; font-weight: 700;">Em aberto</span>`;
    case 'aguardando_producao':
      return `<span style="display: inline-flex; align-items: center; background: transparent; color: #ea580c; padding: 2px 6px; font-size: 0.85rem; font-weight: 700;">Aguardando produção</span>`;
    case 'em_producao':
      return `<span style="display: inline-flex; align-items: center; background: transparent; color: #2563eb; padding: 2px 6px; font-size: 0.85rem; font-weight: 700;">Em produção</span>`;
    case 'produzido_estoque_flow':
      return `<span style="display: inline-flex; align-items: center; background: transparent; color: #59338f; padding: 2px 6px; font-size: 0.85rem; font-weight: 700;">No estoque Flow</span>`;
    case 'enviado':
      return `<span style="display: inline-flex; align-items: center; background: transparent; color: #059669; padding: 2px 6px; font-size: 0.85rem; font-weight: 700;">Enviado ao cliente</span>`;
    case 'cancelado':
      return `<span style="display: inline-flex; align-items: center; background: transparent; color: #dc2626; padding: 2px 6px; font-size: 0.85rem; font-weight: 700;">Cancelado</span>`;
    default:
      return `<span style="font-size: 0.85rem; font-weight: 700; color: #64748b;">${escapeHtml(status)}</span>`;
  }
}

function getStoreDeliveryTypeBadge(isFlow) {
  if (isFlow) {
    return `<span style="display: inline-flex; align-items: center; gap: 4px; background: #59338f; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; width: fit-content; line-height: 1.3;">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      <span>Envio Flow</span>
    </span>`;
  }
  return `<span style="display: inline-flex; align-items: center; gap: 4px; background: #334155; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; width: fit-content; line-height: 1.3;">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
    <span>Envio Direto</span>
  </span>`;
}

function getOrderReadyDateText(order) {
  const prodDays = parseInt(order.production_days, 10) || 7;
  let readyDateStr = '-';
  if (order.estimated_ready_date) {
    const d = new Date(order.estimated_ready_date);
    if (!isNaN(d.getTime())) readyDateStr = d.toLocaleDateString('pt-BR');
  } else if (order.created_at) {
    const base = new Date(order.created_at);
    if (!isNaN(base.getTime())) {
      readyDateStr = new Date(base.getTime() + prodDays * 86400000).toLocaleDateString('pt-BR');
    }
  }
  return { prodDays, readyDateStr };
}

async function loadClientStoreOrders() {
  const container = document.getElementById('client-store-orders-list');
  if (!container) return;

  container.innerHTML = '<div class="card" style="text-align: center; padding: 2rem; color: var(--text-muted);">Carregando seus pedidos...</div>';

  try {
    const res = await fetch('/api/store/orders');
    const orders = await res.json();
    allClientStoreOrders = Array.isArray(orders) ? orders : [];
    renderClientStoreOrders();
  } catch (err) {
    container.innerHTML = '<div class="card" style="color: #ef4444; padding: 1.5rem;">Erro ao carregar pedidos.</div>';
  }
}
window.loadClientStoreOrders = loadClientStoreOrders;

function handleClientOrdersPeriodChange(periodVal) {
  const fromEl = document.getElementById('filter-client-orders-date-from');
  const toEl = document.getElementById('filter-client-orders-date-to');

  if (periodVal !== 'custom') {
    if (fromEl) fromEl.value = '';
    if (toEl) toEl.value = '';
  }
  renderClientStoreOrders();
}
window.handleClientOrdersPeriodChange = handleClientOrdersPeriodChange;

function handleClientOrdersCustomDateChange() {
  const periodEl = document.getElementById('filter-client-orders-period');
  const fromVal = document.getElementById('filter-client-orders-date-from')?.value || '';
  const toVal = document.getElementById('filter-client-orders-date-to')?.value || '';

  if ((fromVal || toVal) && periodEl) {
    periodEl.value = 'custom';
  }
  renderClientStoreOrders();
}
window.handleClientOrdersCustomDateChange = handleClientOrdersCustomDateChange;

function clearClientStoreOrdersFilters() {
  const periodEl = document.getElementById('filter-client-orders-period');
  const fromEl = document.getElementById('filter-client-orders-date-from');
  const toEl = document.getElementById('filter-client-orders-date-to');
  const statusEl = document.getElementById('filter-client-orders-status');

  if (periodEl) periodEl.value = 'all';
  if (fromEl) fromEl.value = '';
  if (toEl) toEl.value = '';
  if (statusEl) statusEl.value = '';

  renderClientStoreOrders();
}
window.clearClientStoreOrdersFilters = clearClientStoreOrdersFilters;

function renderClientStoreOrders() {
  const container = document.getElementById('client-store-orders-list');
  const countEl = document.getElementById('client-store-orders-count');
  if (!container) return;

  if (!allClientStoreOrders || allClientStoreOrders.length === 0) {
    if (countEl) countEl.textContent = '0 pedidos';
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2.5rem;">
        <h3 style="font-size: 1.05rem; font-weight: 700; margin-bottom: 0.4rem;">Você ainda não realizou pedidos na Loja Virtual</h3>
        <p style="color: var(--text-muted); font-size: 0.86rem; margin-bottom: 1rem;">Acesse a Vitrine da Loja para escolher seus produtos personalizados.</p>
        <button type="button" class="btn btn-primary" onclick="switchTab('tab-store-catalog')">Ir para a Vitrine da Loja</button>
      </div>
    `;
    return;
  }

  const periodFilter = document.getElementById('filter-client-orders-period')?.value || 'all';
  const dateFromStr = document.getElementById('filter-client-orders-date-from')?.value || '';
  const dateToStr = document.getElementById('filter-client-orders-date-to')?.value || '';
  const statusFilter = document.getElementById('filter-client-orders-status')?.value || '';

  let filtered = [...allClientStoreOrders];

  // 1. Filtro por Status
  if (statusFilter) {
    filtered = filtered.filter(o => o.status === statusFilter);
  }

  // 2. Filtro por Período / Intervalo de Datas / Últimos Pedidos
  const now = new Date();
  if (periodFilter === '7d' || periodFilter === '30d' || periodFilter === '90d') {
    const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
    const cutoff = new Date(now.getTime() - daysMap[periodFilter] * 86400000);
    filtered = filtered.filter(o => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at);
      return !isNaN(d.getTime()) && d >= cutoff;
    });
  } else if (dateFromStr || dateToStr) {
    const startTs = dateFromStr ? new Date(dateFromStr + 'T00:00:00').getTime() : null;
    const endTs = dateToStr ? new Date(dateToStr + 'T23:59:59').getTime() : null;
    filtered = filtered.filter(o => {
      if (!o.created_at) return false;
      const ts = new Date(o.created_at).getTime();
      if (isNaN(ts)) return false;
      if (startTs !== null && ts < startTs) return false;
      if (endTs !== null && ts > endTs) return false;
      return true;
    });
  }

  if (periodFilter === 'last5') {
    filtered = filtered.slice(0, 5);
  } else if (periodFilter === 'last10') {
    filtered = filtered.slice(0, 10);
  }

  if (countEl) {
    countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'pedido encontrado' : 'pedidos encontrados'}`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2.25rem; color: var(--text-muted);">
        Nenhum pedido encontrado com os filtros selecionados.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(o => {
    const dateStr = o.created_at ? new Date(o.created_at).toLocaleDateString('pt-BR') : '-';
    const isFlow = o.delivery_type === 'flow';
    const { prodDays, readyDateStr } = getOrderReadyDateText(o);

    // Todos os cards com fundo branco normal e barra frontal colorida para diferenciar
    const cardBg = '#ffffff';
    const cardBorder = '1px solid #e2e8f0';
    const cardLeftAccent = isFlow ? '5px solid #59338f' : '5px solid #334155';

    return `
      <div class="card" style="padding: 1.35rem 1.5rem; background: ${cardBg}; border: ${cardBorder}; border-left: ${cardLeftAccent}; border-radius: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.85rem; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem;">
          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.3rem;">
            ${getStoreDeliveryTypeBadge(isFlow)}
            <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
              <span style="font-family: monospace; font-weight: 800; font-size: 1.05rem; color: var(--primary);">${escapeHtml(o.code)}</span>
              <span style="font-size: 0.82rem; color: #475569;">Realizado em ${dateStr}</span>
              ${o.branch_number ? `<span style="font-size: 0.78rem; font-weight: 700; color: #59338f;">Sede Nº ${escapeHtml(o.branch_number)} — ${escapeHtml(o.client_name || '')}</span>` : (o.client_name ? `<span style="font-size: 0.78rem; font-weight: 700; color: #334155;">${escapeHtml(o.client_name)}</span>` : '')}
              ${(o.billing_name || o.billing_cnpj) ? `<span style="font-size: 0.78rem; font-weight: 700; color: #0f172a;">Faturar para: ${escapeHtml(o.billing_name || '')} ${o.billing_cnpj ? '(' + escapeHtml(o.billing_cnpj) + ')' : ''}</span>` : ''}
            </div>
            ${o.status === 'recusado_matriz' && o.mother_rejection_reason ? `<div style="font-size: 0.78rem; color: #dc2626; font-weight: 700;">Motivo da Recusa (Matriz): ${escapeHtml(o.mother_rejection_reason)}</div>` : ''}
          </div>
          <div style="display: flex; gap: 0.85rem; align-items: center; flex-wrap: wrap;">
            ${getStoreOrderStatusBadge(o.status)}
            ${(o.status === 'aguardando_aprovacao_mae' && (!currentAuthUser?.parent_client_id || currentRole === 'admin')) ? `
              <button type="button" class="btn btn-primary btn-sm" onclick="handleMotherOrderApproval(${o.id}, 'approve')" style="background: #16a34a; border-color: #16a34a; font-weight: 700; padding: 0.38rem 0.75rem;">Aprovar Pedido</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="handleMotherOrderApproval(${o.id}, 'reject')" style="color: #dc2626; border-color: #fecaca; font-weight: 700; padding: 0.38rem 0.75rem;">Recusar</button>
            ` : ''}
            ${o.nf_url ? `<a href="${escapeHtml(o.nf_url)}" download target="_blank" class="btn btn-secondary btn-sm" style="background: #ffffff; font-weight: 700; border: 1px solid #86efac; color: #15803d; padding: 0.4rem 0.75rem; text-decoration: none;">Baixar NF</a>` : ''}
            <button type="button" class="btn btn-secondary btn-sm" onclick="openStoreOrderDetailPage(${o.id}, 'tab-store-orders')" style="background: #ffffff; font-weight: 700; border: 1px solid #cbd5e1; color: #0f172a; padding: 0.4rem 0.85rem;">
              Ver Mais / Resumo
            </button>
          </div>
        </div>

        <div style="background: #ffffff; padding: 0; border: none;">
          <div style="font-size: 0.76rem; font-weight: 800; text-transform: uppercase; color: #475569; margin-bottom: 0.65rem;">Resumo dos Itens Encomendados</div>
          <div style="display: flex; flex-direction: column; gap: 0.65rem;">
            ${(o.items || []).map((it, idx, arr) => {
              const thumbImg = it.product_image || '/images/logow2.png';
              const itemDays = it.production_days || prodDays;
              const isLast = idx === arr.length - 1;
              return `
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.86rem; ${!isLast ? 'padding-bottom: 0.55rem; border-bottom: 1px dashed #e2e8f0;' : ''} gap: 1rem; flex-wrap: wrap;">
                  <div style="display: flex; align-items: center; gap: 0.85rem;">
                    <img src="${escapeHtml(thumbImg)}" alt="${escapeHtml(it.product_name)}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; flex-shrink: 0;">
                    <div>
                      <div>
                        <strong style="color: #0f172a; font-size: 0.92rem;">${escapeHtml(it.product_name)}</strong>
                        <span style="color: #64748b; font-family: monospace; font-size: 0.78rem; margin-left: 0.35rem;">(${escapeHtml(it.product_code || '')})</span>
                      </div>
                      <div style="font-size: 0.8rem; font-weight: 800; color: #334155; margin-top: 0.2rem;">
                        QUANTIDADE ${it.tier_qty} pçs
                      </div>
                      <div style="font-size: 0.78rem; color: #475569; margin-top: 0.15rem;">
                        Prazo de produção: <strong>${itemDays} dias</strong> • Fica pronto em: <strong style="color: var(--primary);">${readyDateStr}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');
}
window.renderClientStoreOrders = renderClientStoreOrders;

function openStoreOrderDetailPage(orderId, returnTab) {
  storeOrderDetailReturnTab = returnTab || 'tab-store-orders';
  const backLabel = document.getElementById('store-order-detail-back-label');
  if (backLabel) {
    if (storeOrderDetailReturnTab === 'tab-admin-store-orders') {
      backLabel.textContent = 'Voltar para Fila de Pedidos (Admin)';
    } else if (storeOrderDetailReturnTab === 'tab-billing') {
      backLabel.textContent = 'Voltar para Carteira';
    } else if (storeOrderDetailReturnTab === 'tab-invoices-nf') {
      backLabel.textContent = 'Voltar para Notas Fiscais';
    } else if (storeOrderDetailReturnTab === 'page-client-detail') {
      backLabel.textContent = 'Voltar para Carteira do Cliente';
    } else if (storeOrderDetailReturnTab === 'tab-mother-approvals') {
      backLabel.textContent = 'Voltar para Aprovação de Compras';
    } else {
      backLabel.textContent = 'Voltar para Meus Pedidos';
    }
  }

  const sourceList = [...allClientStoreOrders, ...allAdminStoreOrders, ...allStoreBillingOrders, ...(window.allMotherApprovalOrders || [])];

  const order = sourceList.find(o => o.id === orderId);
  if (!order) {
    alert('Pedido não encontrado.');
    return;
  }

  const container = document.getElementById('store-order-detail-container');
  if (!container) return;

  const isFlow = order.delivery_type === 'flow';
  const dateStr = order.created_at ? new Date(order.created_at).toLocaleString('pt-BR') : '-';
  const totalPieces = (order.items || []).reduce((acc, it) => acc + (parseInt(it.tier_qty, 10) || 0), 0);
  const { prodDays, readyDateStr } = getOrderReadyDateText(order);

  container.innerHTML = `
    <div class="card" style="margin-bottom: 1.5rem; background: #ffffff; border: 1px solid #e2e8f0; border-left: 5px solid ${isFlow ? '#59338f' : '#334155'};">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 1.25rem;">
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.25rem;">
          <span style="font-size: 0.78rem; font-weight: 700; text-transform: uppercase; color: #475569;">Resumo do Pedido</span>
          ${getStoreDeliveryTypeBadge(isFlow)}
          <h2 style="font-size: 1.5rem; font-weight: 800; color: var(--text-primary); font-family: monospace; margin: 0.15rem 0;">${escapeHtml(order.code)}</h2>
          <span style="font-size: 0.85rem; color: #475569;">Realizado em ${dateStr} • Prazo de produção: <strong>${prodDays} dias</strong> (Fica pronto em: <strong style="color: var(--primary);">${readyDateStr}</strong>) ${order.client_name ? `• Cliente: <strong>${escapeHtml(order.client_name)}</strong>` : ''}</span>
        </div>
        <div style="display: flex; gap: 0.65rem; align-items: center; flex-wrap: wrap;">
          ${getStoreOrderStatusBadge(order.status)}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; margin-bottom: 1.5rem;">
        <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 1.15rem;">
          <h4 style="font-size: 0.82rem; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 0.5rem;">Modalidade, Prazo e Destino</h4>
          ${isFlow
            ? `<p style="font-size: 0.9rem; color: #0f172a; line-height: 1.6; margin: 0;">
                 <strong>Opção 1 — Envio Flow</strong><br>
                 <strong>Prazo de Produção:</strong> ${prodDays} dias (Previsão de término: <strong>${readyDateStr}</strong>)<br>
                 Assim que a produção terminar, todas as <strong>${totalPieces} peças</strong> serão armazenadas no seu estoque dentro do Personaliza Flow para envios sob demanda.
               </p>`
            : `<p style="font-size: 0.9rem; color: #0f172a; line-height: 1.6; margin: 0;">
                 <strong>Opção 2 — Envio Direto</strong><br>
                 <strong>Prazo de Produção:</strong> ${prodDays} dias (Previsão de término: <strong>${readyDateStr}</strong>)<br>
                 <strong>Destinatário:</strong> ${escapeHtml(order.recipient_name || '-')}<br>
                 <strong>Endereço:</strong> ${escapeHtml(order.dest_address)}, ${escapeHtml(order.dest_number)} ${order.dest_complement ? ' - ' + escapeHtml(order.dest_complement) : ''}<br>
                 <strong>Bairro / Cidade:</strong> ${escapeHtml(order.dest_neighborhood || '-')} — ${escapeHtml(order.dest_city)}/${escapeHtml(order.dest_state)}<br>
                 <strong>CEP:</strong> ${escapeHtml(order.dest_cep)}<br>
                 <strong>Transportadora:</strong> ${escapeHtml(order.selected_carrier)} (${escapeHtml(order.selected_service)})
               </p>`
          }
        </div>

        <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 1.15rem;">
          <h4 style="font-size: 0.82rem; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 0.5rem;">Resumo Financeiro & Faturamento</h4>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem; font-size: 0.9rem;">
            <span style="color: #475569;">Sede Solicitante:</span>
            <strong style="color: #0f172a;">${order.branch_number ? `Sede Nº ${escapeHtml(order.branch_number)} - ` : ''}${escapeHtml(order.client_name || '-')}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem; font-size: 0.9rem;">
            <span style="color: #475569;">Faturar para (CNPJ Pagador):</span>
            <strong style="color: var(--primary);">${escapeHtml(order.billing_name || order.client_name || '-')} ${order.billing_cnpj ? '(' + escapeHtml(order.billing_cnpj) + ')' : ''}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem; font-size: 0.9rem;">
            <span style="color: #475569;">Condição de Faturamento:</span>
            <strong style="color: #0f172a;">${escapeHtml(order.payment_method || '30 DIAS BOLETO')}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem; font-size: 0.9rem;">
            <span style="color: #475569;">Status Financeiro:</span>
            <strong style="color: ${order.payment_status === 'pago' ? '#16a34a' : '#d97706'};">${order.payment_status === 'pago' ? 'Quitado / Pago' : 'Em aberto'}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem; font-size: 0.9rem;">
            <span style="color: #475569;">Total de Peças Encomendadas:</span>
            <strong>${totalPieces} peças</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.45rem; font-size: 0.9rem;">
            <span style="color: #475569;">Subtotal dos Produtos:</span>
            <strong>${formatCurrencyBR(order.subtotal_products)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.65rem; font-size: 0.9rem;">
            <span style="color: #475569;">Frete (${isFlow ? 'Isento - Envio Flow' : escapeHtml(order.selected_carrier || 'Envio Direto')}):</span>
            <strong>${formatCurrencyBR(order.freight_price)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding-top: 0.65rem; border-top: 1px solid #e2e8f0; font-size: 1.15rem; font-weight: 800; color: var(--primary);">
            <span>Valor Total do Pedido:</span>
            <span>${formatCurrencyBR(order.total_amount)}</span>
          </div>
          <div style="margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px dashed #cbd5e1;">
            <div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: #334155; margin-bottom: 0.4rem;">Documentos Fiscais (NF & Boleto)</div>
            ${(order.nf_url || order.boleto_url)
              ? `<div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                   ${order.nf_number ? `<span style="font-size: 0.8rem; font-weight: 700; color: #0f172a;">Nº NF: ${escapeHtml(order.nf_number)}</span>` : ''}
                   ${order.nf_url ? `<a href="${escapeHtml(order.nf_url)}" download target="_blank" class="btn btn-sm" style="background: #16a34a; color: #fff; text-decoration: none; font-size: 0.76rem; font-weight: 700; padding: 0.35rem 0.75rem; border-radius: 6px;">Baixar Nota Fiscal (NF)</a>` : ''}
                   ${order.boleto_url ? `<a href="${escapeHtml(order.boleto_url)}" download target="_blank" class="btn btn-sm" style="background: #2563eb; color: #fff; text-decoration: none; font-size: 0.76rem; font-weight: 700; padding: 0.35rem 0.75rem; border-radius: 6px;">Baixar Boleto</a>` : ''}
                 </div>`
              : `<div style="font-size: 0.8rem; color: #64748b;">Nota Fiscal e Boleto ainda não anexados para este pedido.</div>`
            }
          </div>
        </div>
      </div>

      ${order.notes ? `
        <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 1rem 1.15rem; margin-bottom: 1.5rem;">
          <h4 style="font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 0.35rem;">Observações do Pedido</h4>
          <p style="font-size: 0.9rem; color: #0f172a; margin: 0;">${escapeHtml(order.notes)}</p>
        </div>
      ` : ''}

      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 1.25rem;">
        <h3 style="font-size: 1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 1rem;">Produtos Encomendados neste Pedido</h3>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Foto</th>
                <th>Código / SKU</th>
                <th>Produto</th>
                <th>Prazo de Produção</th>
                <th>Quantidade Encomendada</th>
                <th>Valor Unitário</th>
                <th>Subtotal do Item</th>
              </tr>
            </thead>
            <tbody>
              ${(order.items || []).map(it => {
                const img = it.product_image || '/images/logow2.png';
                return `
                  <tr>
                    <td>
                      <img src="${escapeHtml(img)}" alt="${escapeHtml(it.product_name)}" style="width: 52px; height: 52px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border-color);">
                    </td>
                    <td style="font-family: monospace; font-weight: 700;">${escapeHtml(it.product_code || '-')}</td>
                    <td style="font-weight: 700; color: var(--text-primary);">${escapeHtml(it.product_name)}</td>
                    <td><span class="badge badge-secondary" style="font-size: 0.8rem;">${it.production_days || prodDays} dias (Pronto em ${readyDateStr})</span></td>
                    <td><span class="badge badge-primary" style="font-size: 0.85rem;">${it.tier_qty} peças</span></td>
                    <td style="font-weight: 600;">${formatCurrencyBR(it.unit_price)} / un</td>
                    <td style="font-weight: 800; color: var(--primary); font-size: 0.95rem;">${formatCurrencyBR(it.total_price)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  switchTab('page-store-order-detail');
}
window.openStoreOrderDetailPage = openStoreOrderDetailPage;

function closeStoreOrderDetailPage() {
  switchTab(storeOrderDetailReturnTab || 'tab-store-orders');
}
window.closeStoreOrderDetailPage = closeStoreOrderDetailPage;

async function loadAdminStoreOrders() {
  const container = document.getElementById('admin-store-orders-container');
  if (!container) return;

  container.innerHTML = '<div class="card" style="text-align: center; padding: 2rem;">Carregando fila de pedidos de produção...</div>';

  try {
    const res = await fetch('/api/store/orders');
    allAdminStoreOrders = await res.json();
    renderAdminStoreOrders();
  } catch (err) {
    container.innerHTML = '<div class="card" style="color: #ef4444; padding: 1.5rem;">Erro ao carregar pedidos da loja.</div>';
  }
}
window.loadAdminStoreOrders = loadAdminStoreOrders;

function renderAdminStoreOrders() {
  const container = document.getElementById('admin-store-orders-container');
  if (!container) return;

  const statusFilter = document.getElementById('filter-admin-store-orders-status')?.value || '';
  const list = statusFilter
    ? (allAdminStoreOrders || []).filter(o => o.status === statusFilter)
    : (allAdminStoreOrders || []);

  if (list.length === 0) {
    container.innerHTML = '<div class="card" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">Nenhum pedido da loja encontrado para este filtro.</div>';
    return;
  }

  container.innerHTML = list.map(o => {
    const dateStr = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '-';
    const isFlow = o.delivery_type === 'flow';
    const { prodDays, readyDateStr } = getOrderReadyDateText(o);
    const cardBg = '#ffffff';
    const cardBorder = '1px solid #e2e8f0';
    const cardLeftAccent = isFlow ? '5px solid #59338f' : '5px solid #334155';

    return `
      <div class="card" style="padding: 1.25rem 1.5rem; background: ${cardBg}; border: ${cardBorder}; border-left: ${cardLeftAccent}; border-radius: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.85rem; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
          <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 0.3rem;">
            ${getStoreDeliveryTypeBadge(isFlow)}
            <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
              <span style="font-family: monospace; font-weight: 800; font-size: 1.05rem; color: var(--primary);">${escapeHtml(o.code)}</span>
              <span style="font-weight: 700; color: var(--text-primary);">${o.branch_number ? `Sede Nº ${escapeHtml(o.branch_number)} - ` : ''}${escapeHtml(o.client_name || 'Cliente #' + o.client_id)}</span>
              <span style="font-size: 0.8rem; color: var(--text-muted);">${dateStr}</span>
              <span style="font-size: 0.78rem; color: #334155; background: #f8fafc; padding: 2px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                Prazo: <strong>${prodDays} dias</strong> • Pronto em: <strong style="color: var(--primary);">${readyDateStr}</strong>
              </span>
              <span style="font-size: 0.78rem; color: #59338f; background: #f5f3ff; padding: 2px 8px; border-radius: 6px; border: 1px solid #ddd6fe; font-weight: 700;">
                Faturamento: ${escapeHtml(o.payment_method || '30 DIAS BOLETO')}
              </span>
              ${(o.billing_name || o.billing_cnpj) ? `
              <span style="font-size: 0.78rem; color: #0f172a; background: #f1f5f9; padding: 2px 8px; border-radius: 6px; border: 1px solid #cbd5e1; font-weight: 700;">
                Faturar p/: ${escapeHtml(o.billing_name || '')} ${o.billing_cnpj ? '(' + escapeHtml(o.billing_cnpj) + ')' : ''}
              </span>` : ''}
            </div>
            <div style="font-size: 0.82rem; color: var(--text-muted);">
              E-mail: ${escapeHtml(o.client_email || '-')} | Contato: ${escapeHtml(o.client_phone || '-')}
            </div>
          </div>

          <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
            ${getStoreOrderStatusBadge(o.status)}
            <button type="button" class="btn btn-secondary btn-sm" onclick="openStoreOrderDetailPage(${o.id}, 'tab-admin-store-orders')" style="background: #ffffff; font-weight: 700; border: 1px solid #94a3b8; color: #0f172a;">
              Resumo do Pedido
            </button>
          </div>
        </div>

        <div class="table-responsive" style="margin-bottom: 1rem;">
          <table>
            <thead>
              <tr>
                <th>Foto</th>
                <th>Código</th>
                <th>Produto para Produção</th>
                <th>Prazo</th>
                <th>Quantidade Solicitada</th>
                <th>Valor Unitário</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${(o.items || []).map(it => {
                const thumbImg = it.product_image || '/images/logow2.png';
                return `
                  <tr>
                    <td><img src="${escapeHtml(thumbImg)}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-color);"></td>
                    <td style="font-family: monospace; font-weight: 700;">${escapeHtml(it.product_code || '-')}</td>
                    <td style="font-weight: 700;">${escapeHtml(it.product_name)}</td>
                    <td><span class="badge badge-secondary">${it.production_days || prodDays} dias</span></td>
                    <td><span class="badge badge-primary">${it.tier_qty} pçs</span></td>
                    <td>${formatCurrencyBR(it.unit_price)}</td>
                    <td style="font-weight: 700;">${formatCurrencyBR(it.total_price)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; background: #f8fafc; padding: 0.85rem 1rem; border-radius: 8px; border: 1px solid var(--border-color);">
          <div style="font-size: 0.85rem; color: var(--text-secondary);">
            ${isFlow
              ? '<strong>Modalidade Flow:</strong> Ao concluir a produção e selecionar "Concluído (Enviar ao Estoque Flow)", o saldo de peças entrará automaticamente em "Meus Produtos" deste cliente.'
              : `<strong>Entregar em:</strong> ${escapeHtml(o.recipient_name)} — ${escapeHtml(o.dest_address)}, ${escapeHtml(o.dest_number)} (${escapeHtml(o.dest_city)}/${escapeHtml(o.dest_state)} - CEP ${escapeHtml(o.dest_cep)}) | Frete: ${escapeHtml(o.selected_carrier)} (${formatCurrencyBR(o.freight_price)})`}
            ${o.notes ? `<div style="margin-top: 0.3rem; color: var(--text-primary);"><strong>Obs. do Cliente:</strong> ${escapeHtml(o.notes)}</div>` : ''}
          </div>

          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <strong style="font-size: 1.05rem; color: var(--primary);">Total: ${formatCurrencyBR(o.total_amount)}</strong>
            <select onchange="updateAdminStoreOrderStatus(${o.id}, this.value)" style="padding: 0.45rem 0.75rem; border: 1px solid ${o.status === 'em_aberto' ? '#f59e0b' : 'var(--border-color)'}; border-radius: 6px; font-size: 0.84rem; font-weight: 700; background: #fff; color: ${o.status === 'em_aberto' ? '#d97706' : '#0f172a'};">
              <option value="aguardando_aprovacao_mae" ${o.status === 'aguardando_aprovacao_mae' ? 'selected' : ''}>Aguard. Aprovação Matriz</option>
              <option value="recusado_matriz" ${o.status === 'recusado_matriz' ? 'selected' : ''}>Recusado pela Matriz</option>
              <option value="em_aberto" ${o.status === 'em_aberto' ? 'selected' : ''}>0. Em Aberto (Aprovado Matriz / Aguard. Admin)</option>
              <option value="aguardando_producao" ${o.status === 'aguardando_producao' ? 'selected' : ''}>1. Aguardando Produção (Aprova p/ Carteira)</option>
              <option value="em_producao" ${o.status === 'em_producao' ? 'selected' : ''}>2. Em Produção</option>
              <option value="produzido_estoque_flow" ${o.status === 'produzido_estoque_flow' ? 'selected' : ''}>3. Concluído (Enviar ao Estoque Flow)</option>
              <option value="enviado" ${o.status === 'enviado' ? 'selected' : ''}>4. Concluído (Enviado ao Cliente)</option>
              <option value="cancelado" ${o.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }).join('');
}
window.renderAdminStoreOrders = renderAdminStoreOrders;

async function updateAdminStoreOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/store/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar status.');

    if (typeof showToast === 'function') showToast(data.message, 'success');
    await loadAdminStoreOrders();
    if (typeof refreshSystemNotifications === 'function') refreshSystemNotifications();
    if (data.synced_to_flow && typeof loadProducts === 'function') {
      loadProducts();
    }
  } catch (err) {
    alert(err.message);
  }
}
window.updateAdminStoreOrderStatus = updateAdminStoreOrderStatus;

// --------------------------------------------------------------------------
// 5.5 FATURAMENTO — COMPRAS DA LOJA VIRTUAL (CLIENTE E ADMIN)
// --------------------------------------------------------------------------

async function loadStoreBilling() {
  const tbody = document.getElementById('store-billing-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-muted);">Carregando faturamento da loja...</td></tr>';

  try {
    const res = await fetch('/api/store/orders');
    const orders = await res.json();
    allStoreBillingOrders = Array.isArray(orders) ? orders : [];

    // Popular filtro de condições de faturamento
    const methodSelect = document.getElementById('filter-store-billing-method');
    if (methodSelect) {
      const currentVal = methodSelect.value;
      const uniqueMethods = [...new Set(allStoreBillingOrders.map(o => o.payment_method || '30 DIAS BOLETO').filter(Boolean))];
      methodSelect.innerHTML = '<option value="">Todas as condições</option>' +
        uniqueMethods.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
      methodSelect.value = currentVal;
    }

    renderStoreBilling();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 1.5rem; color: #ef4444;">Erro ao carregar faturamento da loja.</td></tr>';
  }
}
window.loadStoreBilling = loadStoreBilling;

function clearStoreBillingFilters() {
  const st = document.getElementById('filter-store-billing-status');
  const mt = document.getElementById('filter-store-billing-method');
  if (st) st.value = '';
  if (mt) mt.value = '';
  renderStoreBilling();
}
window.clearStoreBillingFilters = clearStoreBillingFilters;

function renderStoreBilling() {
  const tbody = document.getElementById('store-billing-tbody');
  if (!tbody) return;

  const isAdmin = currentRole === 'admin';
  const thClient = document.getElementById('th-store-billing-client');
  if (thClient) {
    if (isAdmin) thClient.classList.remove('hidden');
    else thClient.classList.add('hidden');
  }

  const activeOrders = (allStoreBillingOrders || []).filter(o => o.status !== 'cancelado');

  // Atualizar KPIs
  let openSum = 0;
  let paidSum = 0;
  activeOrders.forEach(o => {
    const val = parseFloat(o.total_amount) || 0;
    if (o.payment_status === 'pago') paidSum += val;
    else openSum += val;
  });

  const openEl = document.getElementById('store-billing-open-total');
  const paidEl = document.getElementById('store-billing-paid-total');
  const allEl = document.getElementById('store-billing-all-total');
  if (openEl) openEl.textContent = formatCurrencyBR(openSum);
  if (paidEl) paidEl.textContent = formatCurrencyBR(paidSum);
  if (allEl) allEl.textContent = formatCurrencyBR(openSum + paidSum);

  // Filtros
  const statusFilter = document.getElementById('filter-store-billing-status')?.value || '';
  const methodFilter = document.getElementById('filter-store-billing-method')?.value || '';

  let filtered = [...activeOrders];
  if (statusFilter) {
    filtered = filtered.filter(o => (o.payment_status || 'em_aberto') === statusFilter);
  }
  if (methodFilter) {
    filtered = filtered.filter(o => (o.payment_method || '30 DIAS BOLETO') === methodFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${isAdmin ? 9 : 8}" style="text-align: center; padding: 2.25rem; color: var(--text-muted);">Nenhum pedido faturado encontrado para os filtros selecionados.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(o => {
    const dateStr = o.created_at ? new Date(o.created_at).toLocaleDateString('pt-BR') : '-';
    const isFlow = o.delivery_type === 'flow';
    const isPaid = o.payment_status === 'pago';
    const methodLabel = o.payment_method || '30 DIAS BOLETO';
    const itemsSummary = (o.items || []).map(it => `${it.product_name} (${it.tier_qty} pçs)`).join(', ');

    return `
      <tr>
        <td style="font-family: monospace; font-weight: 800; color: var(--primary);">${escapeHtml(o.code)}</td>
        <td>${dateStr}</td>
        ${isAdmin ? `<td style="font-weight: 700;">${escapeHtml(o.client_name || 'Cliente #' + o.client_id)}</td>` : ''}
        <td style="max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(itemsSummary)}">${escapeHtml(itemsSummary || '-')}</td>
        <td>
          <span style="display: inline-flex; align-items: center; background: #f5f3ff; color: #59338f; border: 1px solid #ddd6fe; font-weight: 700; font-size: 0.76rem; padding: 3px 8px; border-radius: 6px;">
            ${escapeHtml(methodLabel)}
          </span>
        </td>
        <td>${getStoreDeliveryTypeBadge(isFlow)}</td>
        <td style="font-weight: 800; color: var(--text-primary);">${formatCurrencyBR(o.total_amount)}</td>
        <td>
          ${isPaid
            ? '<span style="color: #16a34a; font-weight: 700; font-size: 0.84rem;">Quitado</span>'
            : '<span style="color: #d97706; font-weight: 700; font-size: 0.84rem;">Em aberto</span>'}
        </td>
        <td style="text-align: right;">
          <div style="display: flex; justify-content: flex-end; gap: 0.45rem; align-items: center;">
            ${isAdmin
              ? (isPaid
                  ? `<button type="button" class="btn btn-secondary btn-sm" onclick="toggleStoreOrderPaymentStatus(${o.id}, 'em_aberto')" style="font-size: 0.76rem; padding: 0.3rem 0.65rem;">Reabrir</button>`
                  : `<button type="button" class="btn btn-primary btn-sm" onclick="toggleStoreOrderPaymentStatus(${o.id}, 'pago')" style="background: #16a34a; border-color: #16a34a; font-size: 0.76rem; padding: 0.3rem 0.65rem;">Dar Baixa</button>`)
              : ''}
            <button type="button" class="btn btn-secondary btn-sm" onclick="openStoreOrderDetailPage(${o.id}, 'tab-store-billing')" style="font-size: 0.76rem; padding: 0.3rem 0.65rem;">
              Resumo do Pedido
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
window.renderStoreBilling = renderStoreBilling;

async function toggleStoreOrderPaymentStatus(orderId, nextStatus) {
  try {
    const res = await fetch(`/api/store/orders/${orderId}/payment-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_status: nextStatus })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar status financeiro.');

    if (typeof showToast === 'function') showToast(data.message, 'success');
    await loadBillingData();
    if (activeManagingClientId) {
      await loadClientBilling(activeManagingClientId);
    }
    if (typeof loadClients === 'function') {
      await loadClients();
    }
  } catch (err) {
    alert(err.message);
  }
}
window.toggleStoreOrderPaymentStatus = toggleStoreOrderPaymentStatus;

// --------------------------------------------------------------------------
// 6. ABA LOJA & CONFIGURAÇÕES GERAIS (ADMIN)
// --------------------------------------------------------------------------

async function loadAdminStoreOverview() {
  const tbody = document.getElementById('admin-store-overview-tbody');
  const filterSelect = document.getElementById('filter-admin-store-products-client');
  if (!tbody) return;

  try {
    const res = await fetch('/api/store/overview');
    const rows = await res.json();

    if (filterSelect) {
      const currentVal = filterSelect.value;
      filterSelect.innerHTML = '<option value="">Todos os Clientes</option>' +
        (rows || []).map(r => `<option value="${r.client_id}">${escapeHtml(r.client_name)}</option>`).join('');
      filterSelect.value = currentVal;
    }

    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">Nenhum cliente cadastrado.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td style="font-weight: 700;">${escapeHtml(r.client_name)}</td>
        <td>${escapeHtml(r.client_email)}</td>
        <td>
          ${r.is_enabled
            ? '<span class="badge badge-success">Loja Ativa</span>'
            : '<span class="badge badge-secondary">Inativa</span>'}
        </td>
        <td><strong>${r.products_count || 0}</strong> produtos</td>
        <td><strong>${r.orders_count || 0}</strong> pedidos</td>
        <td style="font-weight: 700; color: var(--primary);">${formatCurrencyBR(r.total_revenue)}</td>
        <td>
          <div style="display: flex; gap: 0.4rem;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="openClientDetailStoreTab(${r.client_id})">Gerenciar Loja</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="openNewStoreProductGlobal(${r.client_id})">+ Produto</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}
window.loadAdminStoreOverview = loadAdminStoreOverview;

async function openClientDetailStoreTab(clientId) {
  await openClientDetailPage(clientId);
  switchClientDetailTab('store');
}
window.openClientDetailStoreTab = openClientDetailStoreTab;

async function loadAdminAllStoreProducts() {
  const tbody = document.getElementById('admin-all-store-products-tbody');
  if (!tbody) return;

  const clientId = document.getElementById('filter-admin-store-products-client')?.value || '';
  const url = clientId ? `/api/store/products?client_id=${clientId}` : '/api/store/products';

  try {
    const res = await fetch(url);
    const prods = await res.json();
    allAdminStoreProducts = prods || [];

    if (!prods || prods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="12" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum produto cadastrado nas lojas.</td></tr>';
      return;
    }

    tbody.innerHTML = prods.map(p => {
      const img = (p.images && p.images[0]) || p.image_url || '/images/logow2.png';
      return `
        <tr>
          <td><img src="${escapeHtml(img)}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-color);"></td>
          <td style="font-weight: 600;">${escapeHtml(p.client_name || '-')}</td>
          <td style="font-family: monospace; font-weight: 700;">${escapeHtml(p.code)}</td>
          <td style="font-weight: 700;">${escapeHtml(p.name)}</td>
          <td><span class="badge badge-secondary" style="font-size: 0.76rem;">${p.production_days || 7} dias</span></td>
          <td>${formatCurrencyBR(p.price_20)}</td>
          <td>${formatCurrencyBR(p.price_50)}</td>
          <td>${formatCurrencyBR(p.price_100)}</td>
          <td>${formatCurrencyBR(p.price_200)}</td>
          <td>${formatCurrencyBR(p.price_500)}</td>
          <td>${formatCurrencyBR(p.price_1000)}</td>
          <td>
            <div style="display: flex; gap: 0.4rem;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="openEditStoreProduct(${p.id}, 'tab-admin-store-settings')">Editar</button>
              <button type="button" class="btn btn-secondary btn-sm" style="color: #ef4444; border-color: #fecaca;" onclick="deleteStoreProduct(${p.id})">Excluir</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}
window.loadAdminAllStoreProducts = loadAdminAllStoreProducts;

// --------------------------------------------------------------------------
// 7. HIERARQUIA CONTA MÃE & SEDES FILHAS, MULTI-CNPJ ("FATURAR PARA") E APROVAÇÃO DE COMPRAS
// --------------------------------------------------------------------------

let allMotherBranchesList = [];
let allMotherApprovalOrders = [];
window.allMotherApprovalOrders = allMotherApprovalOrders;
let branchFormReturnTab = 'tab-mother-branches';

async function loadNetworkBillingOptions(selectId) {
  const selectEl = document.getElementById(selectId);
  if (!selectEl) return;

  try {
    let url = '/api/clients/network/billing-options';
    if (currentRole === 'admin' && typeof activeManagingClientId !== 'undefined' && activeManagingClientId) {
      url += `?client_id=${activeManagingClientId}`;
    }
    const res = await fetch(url);
    if (!res.ok) return;
    const options = await res.json();

    if (!Array.isArray(options) || options.length === 0) {
      selectEl.innerHTML = `<option value="${currentAuthUser?.id || ''}" data-cnpj="${escapeHtml(currentAuthUser?.cnpj || '')}" data-name="${escapeHtml(currentAuthUser?.name || '')}">${escapeHtml(currentAuthUser?.name || 'Minha Conta')} ${currentAuthUser?.cnpj ? '— CNPJ: ' + escapeHtml(currentAuthUser.cnpj) : ''}</option>`;
      handleStoreBillingOptionChange();
      return;
    }

    const myId = (currentRole === 'admin' && typeof activeManagingClientId !== 'undefined' && activeManagingClientId) ? Number(activeManagingClientId) : Number(currentAuthUser?.id);
    selectEl.innerHTML = options.map(opt => {
      const prefix = opt.is_mother
        ? '[MATRIZ]'
        : (opt.branch_number ? `[SEDE Nº ${opt.branch_number}]` : '[SEDE]');
      const cnpjText = opt.cnpj ? ` — CNPJ: ${opt.cnpj}` : ' (Sem CNPJ informado)';
      const isSelected = Number(opt.id) === myId ? 'selected' : '';
      return `<option value="${opt.id}" data-cnpj="${escapeHtml(opt.cnpj || '')}" data-name="${escapeHtml(opt.name || '')}" ${isSelected}>${escapeHtml(prefix)} ${escapeHtml(opt.name)}${escapeHtml(cnpjText)}</option>`;
    }).join('');

    handleStoreBillingOptionChange();
  } catch (err) {
    console.error('Erro ao carregar CNPJs da rede para faturamento:', err);
  }
}
window.loadNetworkBillingOptions = loadNetworkBillingOptions;

function handleStoreBillingOptionChange() {
  const selectEl = document.getElementById('store-checkout-billing-select');
  const labelEl = document.getElementById('store-checkout-billing-target-label');
  if (!selectEl || !labelEl) return;

  const opt = selectEl.options[selectEl.selectedIndex];
  if (!opt) {
    labelEl.textContent = '-';
    return;
  }
  const bName = opt.getAttribute('data-name') || opt.textContent || '-';
  const bCnpj = opt.getAttribute('data-cnpj') || '';
  labelEl.textContent = bCnpj ? `${bName} (${bCnpj})` : bName;
}
window.handleStoreBillingOptionChange = handleStoreBillingOptionChange;

async function loadMotherBranches() {
  const tbody = document.getElementById('mother-branches-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">Carregando sedes e cooperativas vinculadas...</td></tr>';

  try {
    const res = await fetch('/api/clients/branches/list');
    const data = await res.json();
    allMotherBranchesList = Array.isArray(data) ? data : [];
    renderMotherBranchesTable();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 1.5rem; color: #dc2626;">Erro ao carregar sedes filhas.</td></tr>';
  }
}
window.loadMotherBranches = loadMotherBranches;

function renderMotherBranchesTable() {
  const tbody = document.getElementById('mother-branches-tbody');
  const countEl = document.getElementById('mother-branches-count');
  if (!tbody) return;

  const searchInput = document.getElementById('search-mother-branches') || document.getElementById('filter-mother-branches-search');
  const searchQ = (searchInput?.value || '').trim().toLowerCase();
  const filtered = allMotherBranchesList.filter(b => {
    if (!searchQ) return true;
    const str = `${b.branch_number || ''} ${b.name || ''} ${b.cnpj_cpf || b.cnpj || ''} ${b.email || ''} ${b.city || ''} ${b.state || ''}`.toLowerCase();
    return str.includes(searchQ);
  });

  if (countEl) {
    countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'sede cadastrada' : 'sedes cadastradas'}`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2.25rem; color: var(--text-muted);">Nenhuma sede / usuário filho encontrado. Clique em "Cadastrar Nova Sede (Filho)" para criar o primeiro acesso.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(b => {
    const canFlow = Number(b.can_access_flow) !== 0;
    const canStore = Number(b.can_access_store) !== 0;
    const modulesText = [
      canFlow ? '<span style="color: #59338f; font-weight: 800; font-size: 0.78rem;">FLOW</span>' : '',
      canStore ? '<span style="color: #2563eb; font-weight: 800; font-size: 0.78rem;">LOJA</span>' : ''
    ].filter(Boolean).join(' + ') || '<span style="color: #94a3b8;">Nenhum</span>';

    const addrLine = b.address
      ? `${escapeHtml(b.address)}, ${escapeHtml(b.address_number || 'S/N')} — ${escapeHtml(b.city || '')}/${escapeHtml(b.state || '')} (CEP: ${escapeHtml(b.cep || '-')})`
      : '<span style="color: var(--text-muted);">Endereço não informado</span>';

    const statusBadge = b.status === 'inactive'
      ? '<span style="color: #dc2626; font-weight: 700; font-size: 0.78rem;">Inativo</span>'
      : '<span style="color: #16a34a; font-weight: 700; font-size: 0.78rem;">Ativo</span>';

    return `
      <tr>
        <td style="font-family: monospace; font-weight: 800; color: var(--primary);">${b.branch_number ? 'Nº ' + escapeHtml(b.branch_number) : '-'}</td>
        <td>
          <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(b.name)}</div>
          ${b.phone ? `<div style="font-size: 0.76rem; color: var(--text-muted);">${escapeHtml(b.phone)}</div>` : ''}
        </td>
        <td style="font-family: monospace; font-weight: 600;">${escapeHtml(b.cnpj_cpf || b.cnpj || '-')}</td>
        <td style="font-size: 0.8rem; max-width: 260px;">${addrLine}</td>
        <td>${escapeHtml(b.email)}</td>
        <td>${modulesText}</td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">
          <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="openBranchFormPage(${b.id}, 'tab-mother-branches')">Editar</button>
            <button type="button" class="btn btn-secondary btn-sm" style="color: #dc2626; border-color: #fecaca;" onclick="deleteBranchAccount(${b.id}, '${escapeHtml(b.name)}')">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}
window.renderMotherBranchesTable = renderMotherBranchesTable;

async function loadAdminClientBranches(parentClientId) {
  const tbody = document.getElementById('admin-client-branches-tbody');
  if (!tbody || !parentClientId) return;

  tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">Carregando sedes vinculadas...</td></tr>';

  try {
    const res = await fetch(`/api/clients/branches/list?parent_id=${parentClientId}`);
    const list = await res.json();
    allMotherBranchesList = Array.isArray(list) ? list : [];

    if (allMotherBranchesList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">Este cliente não possui sedes/usuários filhos vinculados.</td></tr>';
      return;
    }

    tbody.innerHTML = allMotherBranchesList.map(b => {
      const canFlow = Number(b.can_access_flow) !== 0;
      const canStore = Number(b.can_access_store) !== 0;
      const modulesText = [
        canFlow ? '<span style="color: #59338f; font-weight: 800; font-size: 0.78rem;">FLOW</span>' : '',
        canStore ? '<span style="color: #2563eb; font-weight: 800; font-size: 0.78rem;">LOJA</span>' : ''
      ].filter(Boolean).join(' + ');

      const addrLine = b.address
        ? `${escapeHtml(b.address)}, ${escapeHtml(b.address_number || 'S/N')} — ${escapeHtml(b.city || '')}/${escapeHtml(b.state || '')}`
        : '-';

      const statusBadge = b.status === 'inactive'
        ? '<span style="color: #dc2626; font-weight: 700; font-size: 0.78rem;">Inativo</span>'
        : '<span style="color: #16a34a; font-weight: 700; font-size: 0.78rem;">Ativo</span>';

      return `
        <tr>
          <td style="font-family: monospace; font-weight: 800; color: var(--primary);">${b.branch_number ? 'Nº ' + escapeHtml(b.branch_number) : '-'}</td>
          <td style="font-weight: 700;">${escapeHtml(b.name)}</td>
          <td style="font-family: monospace;">${escapeHtml(b.cnpj_cpf || b.cnpj || '-')}</td>
          <td style="font-size: 0.8rem;">${addrLine}</td>
          <td>${escapeHtml(b.email)}</td>
          <td>${modulesText}</td>
          <td>${statusBadge}</td>
          <td style="text-align: right;">
            <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="openBranchFormPage(${b.id}, 'page-client-detail')">Editar</button>
              <button type="button" class="btn btn-secondary btn-sm" style="color: #dc2626; border-color: #fecaca;" onclick="deleteBranchAccount(${b.id}, '${escapeHtml(b.name)}')">Excluir</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 1.5rem; color: #dc2626;">Erro ao carregar sedes do cliente.</td></tr>';
  }
}
window.loadAdminClientBranches = loadAdminClientBranches;

function openBranchFormPage(branchId = null, returnTab = 'tab-mother-branches') {
  branchFormReturnTab = returnTab;
  const backLabel = document.getElementById('branch-form-back-label');
  if (backLabel) {
    backLabel.textContent = returnTab === 'page-client-detail'
      ? 'Voltar para Gerenciar Cliente'
      : 'Voltar para Minhas Sedes';
  }

  const form = document.getElementById('form-branch') || document.getElementById('form-branch-account');
  if (form) form.reset();

  const idInput = document.getElementById('branch-form-id');
  if (idInput) idInput.value = branchId ? String(branchId) : '';

  const parentId = returnTab === 'page-client-detail' ? activeManagingClientId : (currentAuthUser?.id || '');
  const parentInput = document.getElementById('branch-form-parent-id');
  if (parentInput) parentInput.value = parentId ? String(parentId) : '';

  const titleEl = document.getElementById('branch-form-title') || document.getElementById('branch-form-page-title');
  const pwdReqEl = document.getElementById('branch-pwd-req-label');
  const pwdInput = document.getElementById('branch-form-password');
  const statusSelect = document.getElementById('branch-form-status');

  if (branchId) {
    const branch = allMotherBranchesList.find(b => Number(b.id) === Number(branchId));
    if (!branch) {
      alert('Sede não encontrada.');
      return;
    }
    if (titleEl) titleEl.textContent = `Editar Sede: ${branch.name}`;
    if (pwdReqEl) pwdReqEl.textContent = '(Deixe em branco para manter a atual)';
    if (pwdInput) pwdInput.required = false;
    if (statusSelect) statusSelect.value = branch.status || 'active';

    document.getElementById('branch-form-number').value = branch.branch_number || '';
    document.getElementById('branch-form-name').value = branch.name || '';
    document.getElementById('branch-form-cnpj').value = branch.cnpj_cpf || branch.cnpj || '';
    document.getElementById('branch-form-phone').value = branch.phone || '';
    document.getElementById('branch-form-email').value = branch.email || '';
    document.getElementById('branch-form-password').value = '';
    document.getElementById('branch-form-access-flow').checked = Number(branch.can_access_flow) !== 0;
    document.getElementById('branch-form-access-store').checked = Number(branch.can_access_store) !== 0;
    document.getElementById('branch-form-cep').value = branch.cep || '';
    document.getElementById('branch-form-address').value = branch.address || '';
    document.getElementById('branch-form-addr-number').value = branch.address_number || '';
    document.getElementById('branch-form-complement').value = branch.complement || '';
    document.getElementById('branch-form-neighborhood').value = branch.neighborhood || '';
    document.getElementById('branch-form-city').value = branch.city || '';
    document.getElementById('branch-form-state').value = branch.state || '';
  } else {
    if (titleEl) titleEl.textContent = 'Cadastrar Nova Sede (Usuário Filho)';
    if (pwdReqEl) pwdReqEl.textContent = '*';
    if (pwdInput) pwdInput.required = true;
    if (statusSelect) statusSelect.value = 'active';
    document.getElementById('branch-form-access-flow').checked = true;
    document.getElementById('branch-form-access-store').checked = true;
  }

  switchTab('page-branch-form');
}
window.openBranchFormPage = openBranchFormPage;

function closeBranchFormPage() {
  if (branchFormReturnTab === 'page-client-detail' && activeManagingClientId) {
    switchTab('page-client-detail');
    loadAdminClientBranches(activeManagingClientId);
  } else {
    switchTab('tab-mother-branches');
  }
}
window.closeBranchFormPage = closeBranchFormPage;

async function lookupBranchCep(rawCep) {
  const digits = String(rawCep || '').replace(/\D/g, '');
  if (digits.length !== 8) return;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await res.json();
    if (data && !data.erro) {
      if (data.logradouro) document.getElementById('branch-form-address').value = data.logradouro;
      if (data.bairro) document.getElementById('branch-form-neighborhood').value = data.bairro;
      if (data.localidade) document.getElementById('branch-form-city').value = data.localidade;
      if (data.uf) document.getElementById('branch-form-state').value = data.uf;
    }
  } catch (err) {
    console.warn('Falha ao consultar CEP:', err);
  }
}
window.lookupBranchCep = lookupBranchCep;

async function submitBranchForm(event) {
  event.preventDefault();

  const branchId = document.getElementById('branch-form-id').value;
  const parentClientId = document.getElementById('branch-form-parent-id').value;
  const canFlow = document.getElementById('branch-form-access-flow').checked;
  const canStore = document.getElementById('branch-form-access-store').checked;

  if (!canFlow && !canStore) {
    alert('Selecione pelo menos um módulo liberado (FLOW ou LOJA VIRTUAL) para o usuário filho.');
    return;
  }

  const cnpjVal = document.getElementById('branch-form-cnpj').value.trim();
  const payload = {
    parent_client_id: parentClientId ? Number(parentClientId) : undefined,
    branch_number: document.getElementById('branch-form-number').value.trim(),
    name: document.getElementById('branch-form-name').value.trim(),
    cnpj: cnpjVal,
    cnpj_cpf: cnpjVal,
    phone: document.getElementById('branch-form-phone').value.trim(),
    email: document.getElementById('branch-form-email').value.trim(),
    password: document.getElementById('branch-form-password').value,
    status: document.getElementById('branch-form-status')?.value || 'active',
    can_access_flow: canFlow,
    can_access_store: canStore,
    cep: document.getElementById('branch-form-cep').value.trim(),
    address: document.getElementById('branch-form-address').value.trim(),
    address_number: document.getElementById('branch-form-addr-number').value.trim(),
    complement: document.getElementById('branch-form-complement').value.trim(),
    neighborhood: document.getElementById('branch-form-neighborhood').value.trim(),
    city: document.getElementById('branch-form-city').value.trim(),
    state: document.getElementById('branch-form-state').value.trim().toUpperCase()
  };

  try {
    const url = branchId ? `/api/clients/branches/${branchId}` : '/api/clients/branches';
    const method = branchId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar sede.');

    if (typeof showToast === 'function') showToast(data.message || 'Sede salva com sucesso!', 'success');
    closeBranchFormPage();
  } catch (err) {
    alert(err.message);
  }
}
window.submitBranchForm = submitBranchForm;

async function deleteBranchAccount(branchId, branchName) {
  if (!confirm(`Deseja realmente excluir ou desativar a sede "${branchName}"?`)) return;

  try {
    const res = await fetch(`/api/clients/branches/${branchId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao remover sede.');

    if (typeof showToast === 'function') showToast(data.message, 'success');
    if (branchFormReturnTab === 'page-client-detail' && activeManagingClientId) {
      loadAdminClientBranches(activeManagingClientId);
    } else {
      loadMotherBranches();
    }
  } catch (err) {
    alert(err.message);
  }
}
window.deleteBranchAccount = deleteBranchAccount;

async function loadMotherApprovals() {
  const container = document.getElementById('mother-approvals-list');
  if (!container) return;

  container.innerHTML = '<div class="card" style="text-align: center; padding: 2rem; color: var(--text-muted);">Carregando pedidos das sedes...</div>';

  try {
    const res = await fetch('/api/store/orders');
    const orders = await res.json();
    allMotherApprovalOrders = Array.isArray(orders) ? orders : [];
    window.allMotherApprovalOrders = allMotherApprovalOrders;

    refreshMotherApprovalsBadge();
    renderMotherApprovalsList();
  } catch (err) {
    container.innerHTML = '<div class="card" style="padding: 1.5rem; color: #dc2626;">Erro ao carregar pedidos para aprovação.</div>';
  }
}
window.loadMotherApprovals = loadMotherApprovals;

async function refreshMotherApprovalsBadge() {
  if (typeof refreshSystemNotifications === 'function') {
    await refreshSystemNotifications();
  }
}
window.refreshMotherApprovalsBadge = refreshMotherApprovalsBadge;

function setNavAlertBadge(badgeId, countId, countValue) {
  const badgeEl = document.getElementById(badgeId);
  const countEl = document.getElementById(countId);
  const num = Number(countValue) || 0;
  if (!badgeEl) return;

  if (num > 0) {
    if (countEl) countEl.textContent = String(num);
    else badgeEl.textContent = String(num);
    badgeEl.classList.remove('hidden');
  } else {
    badgeEl.classList.add('hidden');
  }
}

let latestClientBillingDocKeys = [];
let latestClientNfDocKeys = [];

function getSeenStorageKey(type) {
  const uid = currentAuthUser && currentAuthUser.id ? currentAuthUser.id : 'default';
  return `pf_seen_${type}_docs_${uid}`;
}

function getSeenDocSet(type) {
  try {
    const raw = localStorage.getItem(getSeenStorageKey(type));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}

function markClientDocsAsSeen(type, keysArray) {
  try {
    const set = getSeenDocSet(type);
    (keysArray || []).forEach(k => set.add(k));
    localStorage.setItem(getSeenStorageKey(type), JSON.stringify([...set]));
  } catch (_) {}
}

async function refreshSystemNotifications() {
  try {
    const res = await fetch('/api/billing/notifications-summary');
    if (!res.ok) return;
    const data = await res.json();

    const isAdmin = currentRole === 'admin';
    const adm = data.admin || {};
    const cli = data.client || {};
    const isChildBranch = Boolean(currentAuthUser && currentAuthUser.parent_client_id);

    const notifications = [];

    if (isAdmin) {
      // Limpar badges exclusivos de cliente
      setNavAlertBadge('nav-badge-client-store-orders', 'nav-badge-client-store-orders-count', 0);
      setNavAlertBadge('badge-mother-approvals', 'badge-mother-approvals-count', 0);
      setNavAlertBadge('nav-badge-invoices-nf', 'nav-badge-invoices-nf-count', 0);
      setNavAlertBadge('nav-badge-billing', 'nav-badge-billing-count', 0);

      // Popular badges de Admin (somente onde precisa de aprovação: Pedidos da Loja e Gestão de Remessas)
      setNavAlertBadge('nav-badge-admin-store-orders', 'nav-badge-admin-store-orders-count', adm.open_store_orders);
      setNavAlertBadge('nav-badge-shipments', 'nav-badge-shipments-count', adm.open_shipments);

      if (adm.open_store_orders > 0) {
        notifications.push({
          count: adm.open_store_orders,
          title: `${adm.open_store_orders} ${adm.open_store_orders === 1 ? 'pedido da Loja' : 'pedidos da Loja'} aguardando aprovação`,
          sub: 'Status "Em aberto" — clique para conferir e aprovar para produção.',
          targetTab: 'tab-admin-store-orders'
        });
      }
      if (adm.open_shipments > 0) {
        notifications.push({
          count: adm.open_shipments,
          title: `${adm.open_shipments} ${adm.open_shipments === 1 ? 'remessa Flow' : 'remessas Flow'} aguardando aprovação`,
          sub: 'Status "Em aberto" — clique para conferir e liberar separação.',
          targetTab: 'tab-shipments'
        });
      }
    } else {
      // Limpar badges exclusivos de admin
      setNavAlertBadge('nav-badge-admin-store-orders', 'nav-badge-admin-store-orders-count', 0);
      setNavAlertBadge('nav-badge-shipments', 'nav-badge-shipments-count', 0);

      const motherPending = !isChildBranch ? (Number(cli.mother_pending_approvals) || 0) : 0;

      latestClientBillingDocKeys = Array.isArray(cli.billing_doc_keys) ? cli.billing_doc_keys : [];
      latestClientNfDocKeys = Array.isArray(cli.nf_doc_keys) ? cli.nf_doc_keys : [];

      // Se o cliente já está com a página Carteira ou Notas Fiscais aberta, já dá baixa imediata no sino
      const activePage = document.querySelector('.tab-page:not(.hidden)');
      if (activePage && activePage.id === 'tab-billing') {
        markClientDocsAsSeen('billing', latestClientBillingDocKeys);
      }
      if (activePage && activePage.id === 'tab-invoices-nf') {
        markClientDocsAsSeen('nf', latestClientNfDocKeys);
      }

      const seenBilling = getSeenDocSet('billing');
      const seenNf = getSeenDocSet('nf');

      const unseenBillingCount = latestClientBillingDocKeys.filter(k => !seenBilling.has(k)).length;
      const unseenNfCount = latestClientNfDocKeys.filter(k => !seenNf.has(k)).length;

      // Meus Pedidos e Aprovação de Compras (Conta Mãe)
      setNavAlertBadge('nav-badge-client-store-orders', 'nav-badge-client-store-orders-count', motherPending);
      setNavAlertBadge('badge-mother-approvals', 'badge-mother-approvals-count', motherPending);

      // Carteira e Notas Fiscais (Cliente): só aponta quando Admin lança novo Boleto/NF e dá baixa ao abrir a página
      setNavAlertBadge('nav-badge-billing', 'nav-badge-billing-count', unseenBillingCount);
      setNavAlertBadge('nav-badge-invoices-nf', 'nav-badge-invoices-nf-count', unseenNfCount);

      if (motherPending > 0) {
        notifications.push({
          count: motherPending,
          title: `${motherPending} ${motherPending === 1 ? 'pedido de sede' : 'pedidos de sedes'} para aprovar`,
          sub: 'Compra realizada na Loja Virtual aguardando aprovação da Matriz.',
          targetTab: 'tab-mother-approvals'
        });
      }
      if (unseenBillingCount > 0) {
        notifications.push({
          count: unseenBillingCount,
          title: `${unseenBillingCount} ${unseenBillingCount === 1 ? 'novo boleto / cobrança' : 'novos boletos / cobranças'} na Carteira`,
          sub: 'O Admin lançou Boleto e/ou NF — abra a Carteira para visualizar.',
          targetTab: 'tab-billing'
        });
      }
      if (unseenNfCount > 0) {
        notifications.push({
          count: unseenNfCount,
          title: `${unseenNfCount} ${unseenNfCount === 1 ? 'nova Nota Fiscal lançada' : 'novas Notas Fiscais lançadas'}`,
          sub: 'Clique para abrir Notas Fiscais e fazer o download.',
          targetTab: 'tab-invoices-nf'
        });
      }
    }

    const totalAlerts = notifications.reduce((acc, item) => acc + (Number(item.count) || 0), 0);

    // Atualizar badge do Sino no canto superior direito e na barra lateral esquerda
    const topBadge = document.getElementById('top-notification-bell-badge');
    const stripBadge = document.getElementById('strip-notification-bell-badge');
    const headerCountText = document.getElementById('top-bell-dropdown-badge-text');
    const dropdownList = document.getElementById('top-notification-dropdown-list');

    if (topBadge) {
      if (totalAlerts > 0) {
        topBadge.textContent = String(totalAlerts);
        topBadge.classList.remove('hidden');
      } else {
        topBadge.classList.add('hidden');
      }
    }
    if (stripBadge) {
      if (totalAlerts > 0) {
        stripBadge.textContent = String(totalAlerts);
        stripBadge.classList.remove('hidden');
      } else {
        stripBadge.classList.add('hidden');
      }
    }
    if (headerCountText) {
      headerCountText.textContent = totalAlerts > 0 ? `${totalAlerts} pendente(s)` : 'Em dia';
      headerCountText.style.color = totalAlerts > 0 ? '#dc2626' : '#16a34a';
    }

    if (dropdownList) {
      if (notifications.length === 0) {
        dropdownList.innerHTML = `
          <div style="padding: 1.5rem 1rem; text-align: center; color: #64748b; font-size: 0.8rem;">
            Nenhuma pendência ou notificação no momento.
          </div>
        `;
      } else {
        dropdownList.innerHTML = notifications.map(n => `
          <div class="top-bell-item" onclick="handleTopNotificationClick('${n.targetTab}')">
            <div class="top-bell-item-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
            </div>
            <div class="top-bell-item-body">
              <div class="top-bell-item-title">${escapeHtml(n.title)}</div>
              <div class="top-bell-item-sub">${escapeHtml(n.sub)}</div>
            </div>
            <span class="nav-alert-badge" style="align-self: center;">${n.count}</span>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.warn('Falha ao atualizar notificações:', err);
  }
}
window.refreshSystemNotifications = refreshSystemNotifications;

function toggleTopBellDropdown(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('top-notification-dropdown');
  if (!dropdown) return;
  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    refreshSystemNotifications();
    dropdown.classList.remove('hidden');
  } else {
    dropdown.classList.add('hidden');
  }
}
window.toggleTopBellDropdown = toggleTopBellDropdown;

function handleTopNotificationClick(targetTab) {
  const dropdown = document.getElementById('top-notification-dropdown');
  if (dropdown) dropdown.classList.add('hidden');
  if (targetTab) switchTab(targetTab);
}
window.handleTopNotificationClick = handleTopNotificationClick;

document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('top-notification-dropdown');
  const wrapper = document.getElementById('top-bell-wrapper');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    if (wrapper && !wrapper.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  }
});

function renderMotherApprovalsList() {
  const container = document.getElementById('mother-approvals-list');
  if (!container) return;

  const statusFilter = document.getElementById('filter-mother-approvals-status')?.value || 'pending';
  let list = [...(allMotherApprovalOrders || [])];

  if (statusFilter === 'pending' || statusFilter === 'aguardando_aprovacao_mae') {
    list = list.filter(o => o.status === 'aguardando_aprovacao_mae');
  } else if (statusFilter === 'approved') {
    list = list.filter(o => o.mother_approval_status === 'approved' && o.status !== 'aguardando_aprovacao_mae');
  } else if (statusFilter === 'rejected' || statusFilter === 'recusado_matriz') {
    list = list.filter(o => o.status === 'recusado_matriz' || o.mother_approval_status === 'rejected');
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
        Nenhum pedido encontrado com o filtro selecionado.
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(o => {
    const dateStr = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '-';
    const isFlow = o.delivery_type === 'flow';
    const isPending = o.status === 'aguardando_aprovacao_mae';

    return `
      <div class="card" style="padding: 1.25rem 1.5rem; background: #ffffff; border: 1px solid #e2e8f0; border-left: 5px solid ${isPending ? '#7c3aed' : '#16a34a'}; border-radius: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.85rem; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.85rem;">
          <div style="display: flex; flex-direction: column; gap: 0.3rem;">
            ${getStoreDeliveryTypeBadge(isFlow)}
            <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
              <span style="font-family: monospace; font-weight: 800; font-size: 1.05rem; color: var(--primary);">${escapeHtml(o.code)}</span>
              <span style="font-weight: 800; color: #0f172a;">${o.branch_number ? `Sede Nº ${escapeHtml(o.branch_number)} — ` : ''}${escapeHtml(o.client_name || '')}</span>
              <span style="font-size: 0.8rem; color: #64748b;">Solicitado em ${dateStr}</span>
            </div>
            <div style="font-size: 0.84rem; color: #334155;">
              <strong>Faturar para (CNPJ Pagador):</strong> <span style="color: var(--primary); font-weight: 800;">${escapeHtml(o.billing_name || o.client_name || '-')} ${o.billing_cnpj ? '(' + escapeHtml(o.billing_cnpj) + ')' : ''}</span>
              • <strong>Condição:</strong> ${escapeHtml(o.payment_method || '30 DIAS BOLETO')}
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
            ${getStoreOrderStatusBadge(o.status)}
            <strong style="font-size: 1.08rem; color: var(--primary); margin-left: 0.25rem;">${formatCurrencyBR(o.total_amount)}</strong>
            ${isPending ? `
              <button type="button" class="btn btn-primary btn-sm" onclick="handleMotherOrderApproval(${o.id}, 'approve')" style="background: #16a34a; border-color: #16a34a; font-weight: 700; padding: 0.45rem 0.9rem;">
                Aprovar Compra
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="handleMotherOrderApproval(${o.id}, 'reject')" style="color: #dc2626; border-color: #fecaca; font-weight: 700; padding: 0.45rem 0.85rem;">
                Recusar
              </button>
            ` : ''}
            <button type="button" class="btn btn-secondary btn-sm" onclick="openStoreOrderDetailPage(${o.id}, 'tab-mother-approvals')">
              Ver Detalhes
            </button>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.45rem;">
          ${(o.items || []).map(it => `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #334155;">
              <div><strong>${escapeHtml(it.product_name)}</strong> <span style="color: #64748b;">(${it.tier_qty} pçs × ${formatCurrencyBR(it.unit_price)})</span></div>
              <div style="font-weight: 700; color: #0f172a;">${formatCurrencyBR(it.total_price)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}
window.renderMotherApprovalsList = renderMotherApprovalsList;

async function handleMotherOrderApproval(orderId, action) {
  let rejectionReason = '';
  if (action === 'reject') {
    const reason = prompt('Informe o motivo da recusa deste pedido (opcional):', '');
    if (reason === null) return;
    rejectionReason = reason;
  } else {
    if (!confirm('Confirma a aprovação desta compra? O pedido será liberado para conferência e produção da gráfica.')) return;
  }

  try {
    const res = await fetch(`/api/store/orders/${orderId}/mother-approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, rejection_reason: rejectionReason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao processar aprovação.');

    if (typeof showToast === 'function') showToast(data.message, 'success');
    await loadMotherApprovals();
    if (typeof loadClientStoreOrders === 'function') loadClientStoreOrders();
  } catch (err) {
    alert(err.message);
  }
}
window.handleMotherOrderApproval = handleMotherOrderApproval;




