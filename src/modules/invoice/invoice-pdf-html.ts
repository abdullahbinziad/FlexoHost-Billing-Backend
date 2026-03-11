/**
 * Full HTML for invoice PDF – exact copy of portal structure and design.
 * Mirrors: InvoiceDetail.tsx (container) + InvoiceHeader.tsx + InvoiceBody.tsx
 */

export interface InvoicePdfData {
    invoiceNumber: string;
    status: string;
    invoiceDate: string;
    dueDate: string;
    paymentMethod?: string;
    payTo: { name: string; email: string; address: string };
    invoicedTo: {
        companyName?: string;
        name: string;
        addressFormatted: string;
    };
    note?: string;
    items: Array<{ description: string; amount: number }>;
    subtotal: number;
    credit: number;
    total: number;
    balance: number;
    currency: string;
    transactions: Array<{ date: string; gateway: string; transactionId: string; amount: number }>;
}

/** Same as portal: formatInvoiceDate – en-GB */
function formatInvoiceDate(d: Date | string): string {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Same as frontend: BDT -> "TK 1,234.00", else currency code + formatted number */
function formatCurrency(amount: number, currency: string): string {
    const n = Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (currency === 'BDT') return `TK ${n}`;
    return `${currency} ${n}`;
}

/** Status badge: same classes as portal getInvoiceStatusStyles (light theme) */
function statusClass(s: string): string {
    const status = (s || '').toLowerCase();
    if (status === 'paid') return 'invoice-status-paid';
    if (status === 'unpaid' || status === 'overdue') return 'invoice-status-unpaid';
    if (status === 'pending') return 'invoice-status-pending';
    return 'invoice-status-cancelled';
}

function escapeHtml(s: string): string {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(s).replace(/[&<>"']/g, (c) => map[c] || c);
}

export function buildInvoiceHtml(inv: InvoicePdfData): string {
    const status = (inv.status || 'unpaid').toLowerCase();
    const statusBadgeClass = statusClass(inv.status);

    const itemsRows = inv.items
        .map(
            (item, index) => `
        <tr class="invoice-item-row ${index % 2 === 0 ? 'invoice-item-row-even' : ''}">
          <td class="invoice-td invoice-td-desc">${escapeHtml(item.description || 'Item')}</td>
          <td class="invoice-td invoice-td-amount">${formatCurrency(item.amount, inv.currency)}</td>
        </tr>`
        )
        .join('');

    const transactionsRows =
        inv.transactions.length > 0
            ? inv.transactions
                  .map(
                      (tx, index) => `
        <tr class="invoice-tx-row ${index % 2 === 0 ? 'invoice-tx-row-even' : ''}">
          <td class="invoice-tx-td">${escapeHtml(formatInvoiceDate(tx.date))}</td>
          <td class="invoice-tx-td">${escapeHtml(tx.gateway || '—')}</td>
          <td class="invoice-tx-td invoice-tx-id">${escapeHtml(tx.transactionId || '—')}</td>
          <td class="invoice-tx-td invoice-tx-amount">${formatCurrency(tx.amount, inv.currency)}</td>
        </tr>`
                  )
                  .join('')
            : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${escapeHtml(inv.invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .invoice-a4 { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 0; background: #fff; border: 1px solid #e5e7eb; overflow: hidden; }
    .invoice-header { border-bottom: 1px solid #e5e7eb; padding: 40px 32px 32px 32px; }
    .invoice-header-inner { display: flex; align-items: flex-start; justify-content: space-between; gap: 32px; margin-bottom: 32px; }
    .invoice-header-left { flex: 1; }
    .invoice-header-right { flex-shrink: 0; }
    .invoice-title { font-size: 3rem; font-weight: 800; color: #111827; letter-spacing: -0.025em; margin: 0 0 12px 0; }
    .invoice-number-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; margin: 0 0 8px 0; }
    .invoice-number { font-size: 1.5rem; font-weight: 700; color: #111827; margin: 0 0 16px 0; }
    .invoice-status-wrap { padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
    .invoice-status-badge { display: inline-flex; align-items: center; justify-content: center; padding: 10px 16px; border-radius: 8px; font-size: 0.875rem; font-weight: 700; border: 2px solid; text-transform: uppercase; letter-spacing: 0.025em; width: fit-content; }
    .invoice-status-paid { background: #dcfce7; color: #166534; border-color: #86efac; }
    .invoice-status-unpaid { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
    .invoice-status-pending { background: #fef9c3; color: #713f12; border-color: #fde047; }
    .invoice-status-cancelled { background: #f3f4f6; color: #111827; border-color: #d1d5db; }
    .invoice-via { font-size: 0.75rem; color: #6b7280; font-weight: 500; margin: 0; }
    .invoice-dates { display: flex; flex-direction: column; align-items: flex-end; gap: 24px; }
    .invoice-date-block { text-align: right; }
    .invoice-date-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; margin: 0 0 4px 0; }
    .invoice-date-value { font-size: 0.875rem; font-weight: 600; color: #111827; margin: 0; }
    .invoice-body { flex: 1; padding: 24px 32px; }
    .invoice-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
    .invoice-section-label { font-size: 0.75rem; font-weight: 700; color: #111827; text-transform: uppercase; letter-spacing: 0.025em; margin: 0 0 8px 0; }
    .invoice-section p { margin: 0 0 2px 0; font-size: 0.875rem; color: #111827; }
    .invoice-section .invoice-address { color: #6b7280; }
    .invoice-section .invoice-name { font-weight: 600; }
    .invoice-note { padding-top: 16px; }
    .invoice-note p { font-size: 0.75rem; color: #6b7280; font-style: italic; margin: 0; }
    .invoice-items-section { border-top: 1px solid #e5e7eb; padding-top: 16px; }
    .invoice-items-title { font-size: 0.75rem; font-weight: 700; color: #111827; text-transform: uppercase; letter-spacing: 0.025em; margin: 0 0 12px 0; }
    .invoice-table { width: 100%; border-collapse: collapse; }
    .invoice-thead th { text-align: left; padding: 12px 16px; font-size: 0.75rem; font-weight: 700; color: #111827; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #d1d5db; background: #e5e7eb; }
    .invoice-thead th.invoice-th-amount { text-align: right; }
    .invoice-td { padding: 10px 12px; font-size: 0.875rem; color: #111827; border-right: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; }
    .invoice-td-amount { text-align: right; font-weight: 600; }
    .invoice-item-row-even { background: #f9fafb; }
    .invoice-totals { border-top: 1px solid #e5e7eb; padding-top: 16px; }
    .invoice-totals-inner { max-width: 20rem; margin-left: auto; }
    .invoice-totals-row { display: flex; justify-content: space-between; font-size: 0.875rem; margin-bottom: 8px; }
    .invoice-totals-row span:first-child { color: #374151; font-weight: 500; }
    .invoice-totals-row span:last-child { font-weight: 600; color: #111827; }
    .invoice-totals-total { border-top: 1px solid #e5e7eb; padding-top: 8px; margin-top: 8px; display: flex; justify-content: space-between; font-size: 1rem; font-weight: 700; color: #111827; }
    .invoice-tx-section { border-top: 1px solid #e5e7eb; padding-top: 16px; }
    .invoice-tx-title { font-size: 0.75rem; font-weight: 700; color: #111827; text-transform: uppercase; letter-spacing: 0.025em; margin: 0 0 12px 0; }
    .invoice-tx-table { width: 100%; border-collapse: collapse; }
    .invoice-tx-thead th { text-align: left; padding: 8px 12px; font-size: 0.75rem; font-weight: 700; color: #111827; text-transform: uppercase; letter-spacing: 0.025em; border-bottom: 1px solid #e5e7eb; }
    .invoice-tx-thead th.invoice-tx-th-amount { text-align: right; }
    .invoice-tx-td { padding: 8px 12px; font-size: 0.875rem; color: #111827; border-bottom: 1px solid #f3f4f6; }
    .invoice-tx-id { font-family: ui-monospace, monospace; }
    .invoice-tx-amount { text-align: right; font-weight: 600; }
    .invoice-tx-row-even { background: rgba(249, 250, 251, 0.5); }
    .invoice-tx-empty { font-size: 0.75rem; color: #6b7280; font-style: italic; margin: 0; }
    .invoice-balance { border-top: 1px solid #e5e7eb; padding-top: 16px; }
    .invoice-balance-inner { max-width: 20rem; margin-left: auto; display: flex; justify-content: space-between; align-items: center; }
    .invoice-balance-label { font-size: 0.875rem; font-weight: 700; color: #111827; text-transform: uppercase; letter-spacing: 0.025em; }
    .invoice-balance-value { font-size: 1rem; font-weight: 700; }
    .invoice-balance-unpaid { color: #dc2626; }
    .invoice-balance-paid { color: #16a34a; }
  </style>
</head>
<body>
  <div class="invoice-a4" data-invoice-container>
    <header class="invoice-header" data-invoice-header>
      <div class="invoice-header-inner">
        <div class="invoice-header-left">
          <div style="margin-bottom: 16px;">
            <h2 class="invoice-title">INVOICE</h2>
            <p class="invoice-number-label">Invoice Number</p>
            <p class="invoice-number">${escapeHtml(inv.invoiceNumber)}</p>
          </div>
          <div class="invoice-status-wrap">
            <span class="invoice-status-badge ${statusBadgeClass}">${escapeHtml(status)}</span>
            ${status === 'paid' && inv.paymentMethod ? `<p class="invoice-via">via ${escapeHtml(inv.paymentMethod)}</p>` : ''}
          </div>
        </div>
        <div class="invoice-header-right">
          <div class="invoice-dates">
            <div class="invoice-date-block">
              <p class="invoice-date-label">Invoice Date</p>
              <p class="invoice-date-value">${formatInvoiceDate(inv.invoiceDate)}</p>
            </div>
            <div class="invoice-date-block">
              <p class="invoice-date-label">Due Date</p>
              <p class="invoice-date-value">${formatInvoiceDate(inv.dueDate)}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
    <div class="invoice-body">
      <div class="invoice-grid-2">
        <div class="invoice-section">
          <h3 class="invoice-section-label">Pay To:</h3>
          <p class="invoice-name">${escapeHtml(inv.payTo.name)}</p>
          <p>${escapeHtml(inv.payTo.email)}</p>
          ${inv.payTo.address ? `<p class="invoice-address">${escapeHtml(inv.payTo.address)}</p>` : ''}
        </div>
        <div class="invoice-section">
          <h3 class="invoice-section-label">Invoiced To:</h3>
          ${inv.invoicedTo.companyName ? `<p class="invoice-name">${escapeHtml(inv.invoicedTo.companyName)}</p>` : ''}
          <p class="invoice-name">${escapeHtml(inv.invoicedTo.name)}</p>
          <p class="invoice-address">${escapeHtml(inv.invoicedTo.addressFormatted)}</p>
        </div>
      </div>
      ${inv.note ? `<div class="invoice-note"><p>Note: ${escapeHtml(String(inv.note).substring(0, 400))}</p></div>` : ''}
      <div class="invoice-items-section">
        <h3 class="invoice-items-title">Invoice Items</h3>
        <table class="invoice-table">
          <thead class="invoice-thead">
            <tr>
              <th>Description</th>
              <th class="invoice-th-amount">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>
      </div>
      <div class="invoice-totals">
        <div class="invoice-totals-inner">
          <div class="invoice-totals-row"><span>Sub Total</span><span>${formatCurrency(inv.subtotal, inv.currency)}</span></div>
          <div class="invoice-totals-row"><span>Credit</span><span>${formatCurrency(inv.credit, inv.currency)}</span></div>
          <div class="invoice-totals-total">
            <span>Total</span><span>${formatCurrency(inv.total, inv.currency)}</span>
          </div>
        </div>
      </div>
      <div class="invoice-tx-section">
        <h3 class="invoice-tx-title">Transactions</h3>
        ${inv.transactions.length > 0 ? `
        <table class="invoice-tx-table">
          <thead class="invoice-tx-thead">
            <tr>
              <th>Date</th>
              <th>Gateway</th>
              <th>Transaction ID</th>
              <th class="invoice-tx-th-amount">Amount</th>
            </tr>
          </thead>
          <tbody>${transactionsRows}</tbody>
        </table>` : '<p class="invoice-tx-empty">No Related Transactions Found</p>'}
      </div>
      <div class="invoice-balance">
        <div class="invoice-balance-inner">
          <span class="invoice-balance-label">Balance</span>
          <span class="invoice-balance-value ${inv.balance > 0 ? 'invoice-balance-unpaid' : 'invoice-balance-paid'}">${formatCurrency(inv.balance, inv.currency)}</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
