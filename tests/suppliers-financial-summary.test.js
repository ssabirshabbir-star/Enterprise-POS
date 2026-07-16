const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const repository = fs.readFileSync(
  path.join(repoRoot, 'src/main/features/suppliers/suppliers.repository.js'),
  'utf8'
);
const html = fs.readFileSync(path.join(repoRoot, 'src/main/features/suppliers/index.html'), 'utf8');
const renderer = fs.readFileSync(
  path.join(repoRoot, 'src/main/features/suppliers/suppliers.renderer.js'),
  'utf8'
);

test('Suppliers financial summary uses one shared authoritative balance contract', () => {
  assert.match(repository, /function supplierFinancialSummaryJoins/);
  assert.match(repository, /function supplierFinancialSummaryColumns/);
  assert.match(repository, /function mapSupplierFinancialStats/);

  assert.match(repository, /\$\{alias\}\.current_balance::numeric AS total_due/);
  assert.match(repository, /outstandingBalance:\s*totalDue/);
  assert.match(repository, /SUM\(supplier_payments\.amount\)/);
  assert.match(repository, /MAX\(supplier_payments\.created_at\)\s+AS last_payment_date/);
  assert.match(repository, /lastPaymentDate:\s*row\.last_payment_date/);
  assert.match(
    repository,
    /COALESCE\(purchase_summary\.purchase_paid, 0\)[\s\S]*\+[\s\S]*COALESCE\(payment_summary\.supplier_payments_total, 0\)/
  );

  const summaryJoinUses = repository.match(/supplierFinancialSummaryJoins\('suppliers'\)/g) || [];
  const summaryColumnUses =
    repository.match(/supplierFinancialSummaryColumns\('suppliers'\)/g) || [];
  assert.ok(summaryJoinUses.length >= 2, 'list and details should share the summary joins');
  assert.ok(summaryColumnUses.length >= 2, 'list and details should share the summary columns');
});

test('Suppliers list no longer derives outstanding balance from purchase invoice due only', () => {
  assert.doesNotMatch(repository, /SUM\(purchases\.due_amount\)[\s\S]{0,120}AS total_due/);
  assert.doesNotMatch(
    repository,
    /LEFT JOIN purchases ON purchases\.supplier_id = suppliers\.id[\s\S]{0,160}GROUP BY suppliers\.id/
  );
});

test('Suppliers table presents one outstanding balance column and one real last payment column', () => {
  assert.match(html, />Payable<\/th>/);
  assert.match(html, />Last Purchase<\/th>/);
  assert.match(html, />Last Payment<\/th>/);
  assert.doesNotMatch(html, />Due Amount<\/th>/);
  assert.doesNotMatch(html, />Overdue<\/th>/);

  assert.match(renderer, /function supplierLastPayment/);
  assert.match(renderer, /supplier\?\.stats\?\.lastPaymentDate/);
  assert.match(renderer, /formatDate\(lastPayment\)/);
  assert.match(renderer, /formatDateTitle\(lastPayment\)/);
});

test('Suppliers outstanding rendering distinguishes payable, settled, and advance balances', () => {
  assert.match(renderer, /function supplierOutstandingDisplay/);
  assert.match(renderer, /balance < 0/);
  assert.match(renderer, /Advance \$\{money\(Math\.abs\(balance\)\)\}/);
  assert.match(renderer, /Payable balance/);
  assert.match(renderer, /Settled balance/);
});
