(function ExpensesRendererModule() {
  'use strict';

  let initialized = false;
  let submitting = false;
  let expenseRefreshSeq = 0;
  let categoryRefreshSeq = 0;
  let state = {
    categories: [],
    expenses: [],
    summary: { totalExpense: 0, count: 0 },
    canWrite: false,
  };
  const listeners = [];

  const A = () => window.ExpensesApi;

  function $id(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(value) {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function showMessage(text, type = 'success') {
    const el = $id('expenseMessage');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('hidden');
    const isError = type === 'error';
    el.style.background = isError ? '#fef2f2' : '#f0fdf4';
    el.style.color = isError ? '#b91c1c' : '#166534';
    el.style.border = isError ? '1px solid #fca5a5' : '1px solid #86efac';
  }

  function clearMessage() {
    const el = $id('expenseMessage');
    if (!el) return;
    el.textContent = '';
    el.classList.add('hidden');
  }

  function setSubmitDisabled(disabled) {
    const button = $id('saveExpenseButton');
    if (button) button.disabled = Boolean(disabled);
  }

  function getFilters() {
    return {
      from: $id('expenseFromDate')?.value || today(),
      to: $id('expenseToDate')?.value || today(),
      categoryId: $id('expenseCategoryFilter')?.value || '',
      paymentMethod: $id('expensePaymentFilter')?.value || '',
    };
  }

  function payloadFromForm() {
    return {
      categoryId: $id('expenseCategory')?.value || '',
      title: $id('expenseTitle')?.value || '',
      amount: $id('expenseAmount')?.value || '',
      paymentMethod: $id('expensePaymentMethod')?.value || 'Cash',
      expenseDate: $id('expenseDate')?.value || today(),
      notes: $id('expenseNotes')?.value || '',
      receiptPath: '',
    };
  }

  function resetForm() {
    $id('expenseId').value = '';
    $id('expenseTitle').value = '';
    $id('expenseAmount').value = '';
    $id('expensePaymentMethod').value = 'Cash';
    $id('expenseDate').value = today();
    $id('expenseReceiptPath').value = '';
    $id('expenseNotes').value = '';
    setSubmitDisabled(false);
  }

  function renderCategoryOptions() {
    const options = state.categories
      .map((category) => `<option value="${category.id}">${esc(category.name)}</option>`)
      .join('');
    const formSelect = $id('expenseCategory');
    const filterSelect = $id('expenseCategoryFilter');
    if (formSelect) {
      const current = formSelect.value;
      formSelect.innerHTML = options || '<option value="">No categories</option>';
      if ([...formSelect.options].some((option) => option.value === current))
        formSelect.value = current;
    }
    if (filterSelect) {
      const current = filterSelect.value;
      filterSelect.innerHTML = `<option value="">All categories</option>${options}`;
      if ([...filterSelect.options].some((option) => option.value === current))
        filterSelect.value = current;
    }
  }

  function renderEmpty(text) {
    const tbody = $id('expenseTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="px-3 py-8 text-center text-zinc-500">${esc(text)}</td></tr>`;
  }

  function renderExpenses() {
    const tbody = $id('expenseTableBody');
    const total = $id('expenseTotal');
    if (total) total.textContent = money(state.summary.totalExpense);
    if (!tbody) return;
    const rows = Array.isArray(state.expenses) ? state.expenses : [];
    if (!rows.length) {
      renderEmpty('No expenses found for this filter.');
      return;
    }
    tbody.innerHTML = rows
      .map(
        (expense) => `<tr>
          <td class="px-3 py-2">${esc(expense.expenseDate || '-')}</td>
          <td class="px-3 py-2">${esc(expense.categoryName || '-')}</td>
          <td class="px-3 py-2">
            <strong class="block text-zinc-900">${esc(expense.title)}</strong>
            <span class="block text-xs text-zinc-500">${esc(expense.notes || '')}</span>
          </td>
          <td class="px-3 py-2 font-semibold">Rs. ${money(expense.amount)}</td>
          <td class="px-3 py-2">${esc(expense.paymentMethod || '-')}</td>
          <td class="px-3 py-2">
            <div class="flex flex-wrap gap-2">
              <button type="button" class="epos-btn epos-btn-sm epos-btn-outline" data-edit-expense="${expense.id}"${state.canWrite ? '' : ' disabled'}>Edit</button>
              <button type="button" class="epos-btn epos-btn-sm epos-btn-danger" data-delete-expense="${expense.id}"${state.canWrite ? '' : ' disabled'}>Void</button>
            </div>
          </td>
        </tr>`
      )
      .join('');
  }

  async function loadCategories() {
    const seq = ++categoryRefreshSeq;
    const result = await A().listCategories();
    if (seq !== categoryRefreshSeq) return result;
    if (!result?.ok) {
      showMessage(result?.message || 'Unable to load expense categories.', 'error');
      state.categories = [];
      renderCategoryOptions();
      return result;
    }
    state.categories = result.categories || [];
    renderCategoryOptions();
    return result;
  }

  async function loadExpenses(options = {}) {
    const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const seq = ++expenseRefreshSeq;
    if (opts.showLoading !== false) renderEmpty('Loading expenses...');
    try {
      const result = await A().list(getFilters());
      if (seq !== expenseRefreshSeq) return result;
      if (!result?.ok) {
        state.expenses = [];
        state.summary = { totalExpense: 0, count: 0 };
        state.canWrite = false;
        renderExpenses();
        showMessage(result?.message || 'Unable to load expenses.', 'error');
        return result;
      }
      state.expenses = result.expenses || [];
      state.summary = result.summary || { totalExpense: 0, count: 0 };
      state.canWrite = Boolean(result.permissions?.canWrite);
      renderExpenses();
      return result;
    } catch {
      if (seq !== expenseRefreshSeq) return { ok: false, stale: true };
      state.expenses = [];
      state.summary = { totalExpense: 0, count: 0 };
      renderExpenses();
      showMessage('Unable to load expenses.', 'error');
      return { ok: false, message: 'Unable to load expenses.' };
    }
  }

  async function refreshExpensesLiveState(options = {}) {
    const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
    const categoryPromise = opts.includeCategories ? loadCategories() : Promise.resolve(null);
    const expensesPromise = loadExpenses({ showLoading: opts.showLoading === true });
    const [categories, expenses] = await Promise.all([categoryPromise, expensesPromise]);
    return { categories, expenses };
  }

  async function saveExpense(event) {
    event.preventDefault();
    if (submitting) return;
    clearMessage();
    submitting = true;
    setSubmitDisabled(true);
    try {
      const id = Number($id('expenseId')?.value || 0);
      const payload = payloadFromForm();
      const result = id > 0 ? await A().update(id, payload) : await A().create(payload);
      if (!result?.ok) {
        showMessage(result?.message || 'Unable to save expense.', 'error');
        return;
      }
      showMessage(result.message || 'Expense saved.');
      resetForm();
      await refreshExpensesLiveState({ showLoading: false });
    } catch {
      showMessage('Unable to save expense.', 'error');
    } finally {
      submitting = false;
      setSubmitDisabled(false);
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    const input = event.target?.elements?.name;
    const name = String(input?.value || '').trim();
    if (!name) {
      showMessage('Category name is required.', 'error');
      return;
    }
    try {
      const result = await A().createCategory({ name });
      if (!result?.ok) {
        showMessage(result?.message || 'Unable to save category.', 'error');
        return;
      }
      input.value = '';
      showMessage(result.message || 'Category saved.');
      await refreshExpensesLiveState({ includeCategories: true, showLoading: false });
    } catch {
      showMessage('Unable to save category.', 'error');
    }
  }

  function editExpense(expenseId) {
    const expense = state.expenses.find((item) => Number(item.id) === Number(expenseId));
    if (!expense) return;
    $id('expenseId').value = expense.id;
    $id('expenseCategory').value = expense.categoryId || '';
    $id('expenseTitle').value = expense.title || '';
    $id('expenseAmount').value = expense.amount || '';
    $id('expensePaymentMethod').value = expense.paymentMethod || 'Cash';
    $id('expenseDate').value = String(expense.expenseDate || '').slice(0, 10) || today();
    $id('expenseReceiptPath').value = '';
    $id('expenseNotes').value = expense.notes || '';
  }

  async function voidExpense(expenseId) {
    const ok = window.confirm(
      'Void this expense? This keeps an audit trail and removes it from active lists.'
    );
    if (!ok) return;
    try {
      const result = await A().remove(expenseId);
      if (!result?.ok) {
        showMessage(result?.message || 'Unable to void expense.', 'error');
        return;
      }
      showMessage(result.message || 'Expense voided.');
      await refreshExpensesLiveState({ showLoading: false });
    } catch {
      showMessage('Unable to void expense.', 'error');
    }
  }

  function handleTableClick(event) {
    const editButton = event.target.closest('[data-edit-expense]');
    const deleteButton = event.target.closest('[data-delete-expense]');
    if (editButton) editExpense(editButton.dataset.editExpense);
    if (deleteButton) voidExpense(deleteButton.dataset.deleteExpense).catch(() => {});
  }

  function addListener(target, eventName, handler) {
    if (!target) return;
    target.addEventListener(eventName, handler);
    listeners.push({ target, eventName, handler });
  }

  function bindEvents() {
    addListener($id('expenseForm'), 'submit', saveExpense);
    addListener($id('expenseCategoryForm'), 'submit', saveCategory);
    addListener($id('resetExpenseButton'), 'click', resetForm);
    addListener($id('expenseTableBody'), 'click', handleTableClick);
    ['expenseFromDate', 'expenseToDate', 'expenseCategoryFilter', 'expensePaymentFilter'].forEach(
      (id) => {
        addListener($id(id), 'change', () => loadExpenses().catch(() => {}));
      }
    );
  }

  async function renderUI(nextState = {}) {
    if (!$id('expenseForm')) return;
    if (!initialized) {
      initialized = true;
      bindEvents();
      const from = $id('expenseFromDate');
      const to = $id('expenseToDate');
      const date = $id('expenseDate');
      if (from && !from.value) from.value = today();
      if (to && !to.value) to.value = today();
      if (date && !date.value) date.value = today();
    }
    updateUI(nextState);
    await loadCategories();
    await loadExpenses();
  }

  function updateUI(nextState = {}) {
    state = { ...state, ...nextState };
    renderCategoryOptions();
    renderExpenses();
  }

  function destroyUI() {
    listeners.splice(0).forEach(({ target, eventName, handler }) => {
      target.removeEventListener(eventName, handler);
    });
    initialized = false;
    submitting = false;
    state = {
      categories: [],
      expenses: [],
      summary: { totalExpense: 0, count: 0 },
      canWrite: false,
    };
  }

  function initExpensesModule() {
    renderUI().catch(() => showMessage('Unable to load expenses.', 'error'));
  }

  window.ExpensesRenderer = {
    destroyUI,
    renderUI,
    refreshExpensesLiveState,
    updateUI,
  };
  window.initExpensesModule = initExpensesModule;
})();
