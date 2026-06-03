const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const customersRepository = require('./customers.repository');

const READ_ROLES = new Set(['Admin', 'Manager', 'Cashier', 'Saleman']);
const WRITE_ROLES = new Set(['Admin', 'Manager', 'Cashier']);
const BALANCE_ROLES = new Set(['Admin', 'Manager']);

async function requireCustomerAccess(mode = 'read') {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const role = profileResult.profile.role;
  const allowed = mode === 'balance' ? BALANCE_ROLES.has(role) : mode === 'write' ? WRITE_ROLES.has(role) : READ_ROLES.has(role);
  if (!allowed) return { ok: false, message: 'You do not have permission for this customer action.' };
  return { ok: true, profile: profileResult.profile };
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
}

function cleanPayload(payload = {}) {
  const name = String(payload.name || '').trim();
  if (name.length < 2) return { error: 'Customer name is required.' };
  const creditLimit = money(payload.creditLimit);
  const openingBalance = money(payload.openingBalance);
  if (creditLimit === null || openingBalance === null) return { error: 'Invalid customer balance or credit limit.' };
  return {
    name,
    phone: String(payload.phone || '').trim(),
    email: String(payload.email || '').trim(),
    address: String(payload.address || '').trim(),
    cnic: String(payload.cnic || '').trim(),
    openingBalance,
    creditLimit,
    isActive: payload.isActive !== false
  };
}

async function listCustomers(search) {
  const access = await requireCustomerAccess('read');
  if (!access.ok) return access;
  return { ok: true, customers: await customersRepository.listCustomers(search) };
}

async function getCustomerDetails(customerId) {
  const access = await requireCustomerAccess('read');
  if (!access.ok) return access;
  const id = Number(customerId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid customer.' };
  const details = await customersRepository.getCustomerDetails(id);
  if (!details) return { ok: false, message: 'Customer not found.' };
  return { ok: true, ...details };
}

async function createCustomer(payload = {}) {
  const access = await requireCustomerAccess('write');
  if (!access.ok) return access;
  const clean = cleanPayload(payload);
  if (clean.error) return { ok: false, message: clean.error };
  const customer = await customersRepository.createCustomer(clean);
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'customer.create', status: 'success', message: 'Customer created', metadata: { customerId: customer.id } });
  return { ok: true, customer, message: 'Customer saved successfully.' };
}

async function updateCustomer(id, payload = {}) {
  const access = await requireCustomerAccess('write');
  if (!access.ok) return access;
  const customerId = Number(id);
  if (!Number.isInteger(customerId) || customerId <= 0) return { ok: false, message: 'Invalid customer.' };
  const clean = cleanPayload({ ...payload, openingBalance: 0 });
  if (clean.error) return { ok: false, message: clean.error };
  const customer = await customersRepository.updateCustomer(customerId, clean);
  if (!customer) return { ok: false, message: 'Customer not found or cannot be modified.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'customer.update', status: 'success', message: 'Customer updated', metadata: { customerId } });
  return { ok: true, customer, message: 'Customer updated successfully.' };
}

async function deleteCustomer(id) {
  const access = await requireCustomerAccess('write');
  if (!access.ok) return access;
  const customerId = Number(id);
  if (!Number.isInteger(customerId) || customerId <= 0) return { ok: false, message: 'Invalid customer.' };
  const deleted = await customersRepository.softDeleteCustomer(customerId);
  if (!deleted) return { ok: false, message: 'Customer not found or cannot be deleted.' };
  await activityRepository.createActivityLog({ userId: access.profile.id, action: 'customer.delete', status: 'success', message: 'Customer deleted', metadata: { customerId } });
  return { ok: true, message: 'Customer deleted.' };
}

async function addPayment(customerId, payload = {}) {
  const access = await requireCustomerAccess('balance');
  if (!access.ok) return access;
  const id = Number(customerId);
  const amount = money(payload.amount);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: 'Invalid customer.' };
  if (!amount || amount <= 0) return { ok: false, message: 'Payment amount must be greater than zero.' };
  try {
    const payment = await customersRepository.addCustomerPayment(id, { ...payload, amount }, access.profile.id);
    await activityRepository.createActivityLog({ userId: access.profile.id, action: 'customer.payment', status: 'success', message: 'Customer payment posted', metadata: { customerId: id, amount } });
    return { ok: true, payment, message: 'Customer payment posted.' };
  } catch (error) {
    if (error.message === 'CUSTOMER_NOT_FOUND') return { ok: false, message: 'Customer not found.' };
    throw error;
  }
}

async function getDueSummary() {
  const access = await requireCustomerAccess('read');
  if (!access.ok) return access;
  return { ok: true, summary: await customersRepository.getDueSummary() };
}

module.exports = {
  addPayment,
  createCustomer,
  deleteCustomer,
  getCustomerDetails,
  getDueSummary,
  listCustomers,
  updateCustomer
};
