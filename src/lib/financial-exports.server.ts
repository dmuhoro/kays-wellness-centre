import { getDb, isDbAvailable } from "./db.server";
import { requireOrg } from "./tenant.server";
import { logger, EVENTS } from "./logger.server";
import { toCsvValue, rowsToCsv } from "./exports.server";

export interface FinancialRecord {
  id: number;
  invoice_number: string;
  lead_name: string;
  lead_email: string;
  total_amount: number;
  currency: string;
  tax_amount: number;
  status: string;
  issued_at: string;
  paid_at: string | null;
  due_at: string | null;
  payment_method: string | null;
  receipt_number: string | null;
  notes: string | null;
}

export interface QuickBooksInvoice {
  TxnDate: string;
  DocNumber: string;
  CustomerRef: { name: string };
  Line: Array<{
    DetailType: string;
    Amount: number;
    Description: string;
  }>;
  CurrencyRef: { value: string };
  TotalAmt: number;
  Balance: number;
  TxnTaxDetail?: { TotalTax: number };
}

export interface XeroInvoice {
  InvoiceNumber: string;
  Reference: string;
  Contact: { Name: string; EmailAddress: string };
  Date: string;
  DueDate: string | null;
  Status: string;
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    LineAmount: number;
    TaxType: string;
    AccountCode: string;
  }>;
  CurrencyCode: string;
  Total: number;
  AmountDue: number;
}

export const CURRENCY_RATES: Record<string, number> = {
  KES: 0.0077,
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
};

export function convertCurrency(amount: number, from: string, to: string): number {
  const fromRate = CURRENCY_RATES[from] ?? 1;
  const toRate = CURRENCY_RATES[to] ?? 1;
  const usdAmount = amount * fromRate;
  return Math.round((usdAmount / toRate) * 100) / 100;
}

export async function getFinancialRecords(
  orgId: string,
  startDate?: string,
  endDate?: string,
): Promise<FinancialRecord[]> {
  const db = await getDb();
  const conditions: string[] = ["i.organization_id = $1"];
  const params: unknown[] = [orgId];
  let idx = 2;

  if (startDate) {
    conditions.push(`i.created_at >= $${idx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`i.created_at <= $${idx++}`);
    params.push(endDate);
  }

  return db.unsafe<FinancialRecord[]>(
    `SELECT i.id, i.invoice_number, cl.name AS lead_name, cl.email AS lead_email,
            i.total_amount, 'KES' AS currency, 0 AS tax_amount, i.status,
            i.issued_at, i.paid_at, i.due_at,
            p.method AS payment_method, p.receipt_number, i.notes
     FROM invoices i
     JOIN clinic_leads cl ON cl.id = i.lead_id
     LEFT JOIN payments p ON p.invoice_id = i.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY i.created_at DESC`,
    params,
  );
}

export function mapToQuickBooks(records: FinancialRecord[], currency = "KES"): QuickBooksInvoice[] {
  return records.map((r) => ({
    TxnDate: r.issued_at ? new Date(r.issued_at).toISOString().slice(0, 10) : "",
    DocNumber: r.invoice_number,
    CustomerRef: { name: r.lead_name },
    Line: [
      {
        DetailType: "SalesItemLineDetail",
        Amount: r.total_amount,
        Description: r.notes || `Invoice ${r.invoice_number}`,
      },
    ],
    CurrencyRef: { value: currency },
    TotalAmt: r.total_amount,
    Balance: r.status === "paid" ? 0 : r.total_amount,
    ...(r.tax_amount > 0
      ? { TxnTaxDetail: { TotalTax: r.tax_amount } }
      : {}),
  }));
}

export function mapToXero(records: FinancialRecord[], currency = "KES"): XeroInvoice[] {
  return records.map((r) => ({
    InvoiceNumber: r.invoice_number,
    Reference: r.receipt_number || r.invoice_number,
    Contact: { Name: r.lead_name, EmailAddress: r.lead_email || "" },
    Date: r.issued_at ? new Date(r.issued_at).toISOString().slice(0, 10) : "",
    DueDate: r.due_at ? new Date(r.due_at).toISOString().slice(0, 10) : null,
    Status: r.status === "paid" ? "PAID" : r.status === "void" ? "VOIDED" : "AUTHORISED",
    LineItems: [
      {
        Description: r.notes || `Invoice ${r.invoice_number}`,
        Quantity: 1,
        UnitAmount: r.total_amount,
        LineAmount: r.total_amount,
        TaxType: r.tax_amount > 0 ? "OUTPUT" : "NONE",
        AccountCode: "200",
      },
    ],
    CurrencyCode: currency,
    Total: r.total_amount,
    AmountDue: r.status === "paid" ? 0 : r.total_amount,
  }));
}

export function exportQuickBooksCsv(records: FinancialRecord[], currency = "KES"): string {
  const qbRecords = mapToQuickBooks(records, currency);
  const headers = [
    "TxnDate", "DocNumber", "CustomerRef.Name", "Line.0.Amount",
    "Line.0.Description", "CurrencyRef.value", "TotalAmt", "Balance",
    "TxnTaxDetail.TotalTax",
  ];
  const rows = qbRecords.map((r) => ({
    TxnDate: r.TxnDate,
    DocNumber: r.DocNumber,
    "CustomerRef.Name": r.CustomerRef.Name,
    "Line.0.Amount": r.Line[0]?.Amount,
    "Line.0.Description": r.Line[0]?.Description,
    "CurrencyRef.value": r.CurrencyRef.value,
    TotalAmt: r.TotalAmt,
    Balance: r.Balance,
    "TxnTaxDetail.TotalTax": r.TxnTaxDetail?.TotalTax ?? 0,
  }));
  return rowsToCsv(headers, rows);
}

export function exportXeroCsv(records: FinancialRecord[], currency = "KES"): string {
  const xeroRecords = mapToXero(records, currency);
  const headers = [
    "InvoiceNumber", "Reference", "Contact.Name", "Contact.EmailAddress",
    "Date", "DueDate", "Status", "LineItems.0.Description",
    "LineItems.0.Quantity", "LineItems.0.UnitAmount", "LineItems.0.LineAmount",
    "LineItems.0.TaxType", "LineItems.0.AccountCode",
    "CurrencyCode", "Total", "AmountDue",
  ];
  const rows = xeroRecords.map((r) => ({
    InvoiceNumber: r.InvoiceNumber,
    Reference: r.Reference,
    "Contact.Name": r.Contact.Name,
    "Contact.EmailAddress": r.Contact.EmailAddress,
    Date: r.Date,
    DueDate: r.DueDate ?? "",
    Status: r.Status,
    "LineItems.0.Description": r.LineItems[0]?.Description ?? "",
    "LineItems.0.Quantity": r.LineItems[0]?.Quantity ?? 0,
    "LineItems.0.UnitAmount": r.LineItems[0]?.UnitAmount ?? 0,
    "LineItems.0.LineAmount": r.LineItems[0]?.LineAmount ?? 0,
    "LineItems.0.TaxType": r.LineItems[0]?.TaxType ?? "NONE",
    "LineItems.0.AccountCode": r.LineItems[0]?.AccountCode ?? "200",
    CurrencyCode: r.CurrencyCode,
    Total: r.Total,
    AmountDue: r.AmountDue,
  }));
  return rowsToCsv(headers, rows);
}

export function exportFinancialJson(
  records: FinancialRecord[],
  format: "quickbooks" | "xero",
  currency = "KES",
): string {
  if (format === "quickbooks") {
    return JSON.stringify(mapToQuickBooks(records, currency), null, 2);
  }
  return JSON.stringify(mapToXero(records, currency), null, 2);
}
