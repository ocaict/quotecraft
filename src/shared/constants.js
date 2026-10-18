const QUOTE_STATUSES = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
};

const INVOICE_STATUSES = {
  DRAFT: 'draft',
  SENT: 'sent',
  PAID: 'paid',
  PARTIALLY_PAID: 'partially_paid',
  OVERDUE: 'overdue',
};

const SEQUENCE_PREFIXES = {
  QUOTE: 'Q',
  INVOICE: 'INV',
  CREDIT_NOTE: 'CN',
};

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: 'CN¥' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
];

const NIGERIAN_BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'Citibank Nigeria', code: '023' },
  { name: 'Ecobank Nigeria', code: '050' },
  { name: 'Fidelity Bank', code: '070' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'First City Monument Bank (FCMB)', code: '214' },
  { name: 'Guaranty Trust Bank (GTBank)', code: '058' },
  { name: 'Heritage Bank', code: '030' },
  { name: 'Jaiz Bank', code: '301' },
  { name: 'Keystone Bank', code: '082' },
  { name: 'Kuda Bank', code: '50211' },
  { name: 'Lotus Bank', code: '303' },
  { name: 'Moniepoint MFB', code: '50515' },
  { name: 'OPay', code: '999992' },
  { name: 'Optimus Bank', code: '107' },
  { name: 'PalmPay', code: '999991' },
  { name: 'Parallex Bank', code: '104' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'Premium Trust Bank', code: '105' },
  { name: 'Providus Bank', code: '101' },
  { name: 'Stanbic IBTC Bank', code: '221' },
  { name: 'Standard Chartered Bank', code: '068' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'SunTrust Bank', code: '100' },
  { name: 'TAJ Bank', code: '302' },
  { name: 'Titan Trust Bank', code: '102' },
  { name: 'Union Bank of Nigeria', code: '032' },
  { name: 'United Bank for Africa (UBA)', code: '033' },
  { name: 'Unity Bank', code: '215' },
  { name: 'VBank (VFD MFB)', code: '566' },
  { name: 'Wema Bank (ALAT)', code: '035' },
  { name: 'Zenith Bank', code: '057' },
];

function isValidNuban(accountNumber, bankCode) {
  if (!accountNumber || typeof accountNumber !== 'string') return false;
  const cleanAccount = accountNumber.trim();
  if (!/^\d{10}$/.test(cleanAccount)) return false;

  if (!bankCode) return true;

  const cleanBank = String(bankCode).trim();
  if (cleanBank.length === 3) {
    const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3];
    const combined = cleanBank + cleanAccount.substring(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += Number(combined[i]) * weights[i];
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit === Number(cleanAccount[9]);
  }
  return true;
}

function getPaymentBankDetails(profile, currency) {
  if (!profile) return null;
  const curr = String(currency || profile.default_currency || 'USD').toUpperCase();
  const isForeign = ['USD', 'GBP', 'EUR'].includes(curr);

  const hasDom = Boolean(
    (profile.dom_account_number && String(profile.dom_account_number).trim()) ||
    (profile.dom_bank_name && String(profile.dom_bank_name).trim())
  );
  const hasNuban = Boolean(
    (profile.account_number && String(profile.account_number).trim()) ||
    (profile.bank_name && String(profile.bank_name).trim())
  );

  if (isForeign && hasDom) {
    return {
      type: 'domiciliary',
      title: 'International Wire / Domiciliary Transfer',
      currency: curr,
      bankName: profile.dom_bank_name || '',
      accountNumber: profile.dom_account_number || '',
      accountName: profile.dom_account_name || profile.business_name || '',
      swiftCode: profile.dom_swift_code || '',
      intermediaryBank: profile.dom_intermediary_bank || '',
      notes: profile.payment_details || '',
    };
  }

  if (hasNuban) {
    return {
      type: 'nuban',
      title: 'Direct Bank Transfer',
      currency: curr,
      bankName: profile.bank_name || '',
      accountNumber: profile.account_number || '',
      accountName: profile.account_name || profile.business_name || '',
      notes: profile.payment_details || '',
    };
  }

  if (hasDom) {
    return {
      type: 'domiciliary',
      title: 'International Wire / Domiciliary Transfer',
      currency: curr,
      bankName: profile.dom_bank_name || '',
      accountNumber: profile.dom_account_number || '',
      accountName: profile.dom_account_name || profile.business_name || '',
      swiftCode: profile.dom_swift_code || '',
      intermediaryBank: profile.dom_intermediary_bank || '',
      notes: profile.payment_details || '',
    };
  }

  if (profile.payment_details && String(profile.payment_details).trim()) {
    return {
      type: 'generic',
      title: 'Payment Instructions / Bank Details',
      currency: curr,
      notes: profile.payment_details,
    };
  }

  return null;
}

function formatWhatsAppMoney(amount, currencyCode) {
  const code = currencyCode || 'NGN';
  const curr = CURRENCIES.find((c) => c.code === code);
  const symbol = curr ? curr.symbol : (code ? code + ' ' : '₦');
  const num = Number(amount || 0);
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

function normalizeNigerianPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const trimmed = phone.trim();
  const stripped = trimmed.replace(/[\s\-()]/g, '');
  if (!stripped) return '';

  if (stripped.startsWith('+234')) {
    const rest = stripped.substring(4);
    if (rest.startsWith('0') && rest.length === 11) {
      return '+234' + rest.substring(1);
    }
    return stripped;
  }

  if (/^0\d{10}$/.test(stripped)) {
    return '+234' + stripped.substring(1);
  }

  if (/^234\d{10}$/.test(stripped)) {
    return '+' + stripped;
  }

  if (/^[789][01]\d{8}$/.test(stripped)) {
    return '+234' + stripped;
  }

  return trimmed;
}

function formatWhatsAppPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const normalized = normalizeNigerianPhone(phone);
  return normalized.replace(/\D/g, '');
}

function buildWhatsAppInvoiceMessage({ invoice, client, profile, paymentLink } = {}) {
  if (!invoice) return '';
  const clientName = (client && (client.name || client.company_name)) || 'Valued Customer';
  const businessName = (profile && (profile.business_name || profile.name)) || 'our team';
  const invoiceNum = invoice.invoice_number || 'Invoice';
  const currency = invoice.currency || (profile && profile.default_currency) || 'NGN';
  const totalStr = formatWhatsAppMoney(invoice.total || 0, currency);

  const lines = [
    `Hello ${clientName},`,
    '',
    `Here is Invoice ${invoiceNum} for ${totalStr} from ${businessName}.`,
    '',
  ];

  if (invoice.date_due) {
    lines.push(`• Due Date: ${invoice.date_due}`);
  }

  const payLink = paymentLink || invoice.payment_link;
  if (payLink) {
    lines.push(`• Pay Online (Card/Transfer/USSD): ${payLink}`);
  }

  const bankDetails = getPaymentBankDetails(profile, currency);
  if (bankDetails) {
    if (bankDetails.type === 'nuban' && bankDetails.accountNumber) {
      lines.push(`• Bank Transfer: ${bankDetails.bankName || 'Bank'} | ${bankDetails.accountNumber} | ${bankDetails.accountName || businessName}`);
    } else if (bankDetails.type === 'domiciliary' && bankDetails.accountNumber) {
      const swift = bankDetails.swiftCode ? ` (SWIFT: ${bankDetails.swiftCode})` : '';
      lines.push(`• Bank Transfer: ${bankDetails.bankName || 'Bank'} | ${bankDetails.accountNumber} | ${bankDetails.accountName || businessName}${swift}`);
    } else if (bankDetails.notes) {
      lines.push(`• Bank Transfer: ${bankDetails.notes.replace(/\r?\n/g, ' ')}`);
    }
  }

  lines.push('');
  lines.push('The detailed PDF invoice has been attached. Thank you for your business!');

  return lines.join('\n');
}

function buildWhatsAppQuoteMessage({ quote, client, profile } = {}) {
  if (!quote) return '';
  const clientName = (client && (client.name || client.company_name)) || 'Valued Customer';
  const businessName = (profile && (profile.business_name || profile.name)) || 'our team';
  const quoteNum = quote.quote_number || 'Quote';
  const currency = quote.currency || (profile && profile.default_currency) || 'NGN';
  const totalStr = formatWhatsAppMoney(quote.total || 0, currency);

  const lines = [
    `Hello ${clientName},`,
    '',
    `Here is Quote ${quoteNum} for ${totalStr} from ${businessName}.`,
    '',
  ];

  if (quote.valid_until) {
    lines.push(`• Valid Until: ${quote.valid_until}`);
  }

  const bankDetails = getPaymentBankDetails(profile, currency);
  if (bankDetails) {
    if (bankDetails.type === 'nuban' && bankDetails.accountNumber) {
      lines.push(`• Bank Transfer: ${bankDetails.bankName || 'Bank'} | ${bankDetails.accountNumber} | ${bankDetails.accountName || businessName}`);
    } else if (bankDetails.type === 'domiciliary' && bankDetails.accountNumber) {
      const swift = bankDetails.swiftCode ? ` (SWIFT: ${bankDetails.swiftCode})` : '';
      lines.push(`• Bank Transfer: ${bankDetails.bankName || 'Bank'} | ${bankDetails.accountNumber} | ${bankDetails.accountName || businessName}${swift}`);
    } else if (bankDetails.notes) {
      lines.push(`• Bank Transfer: ${bankDetails.notes.replace(/\r?\n/g, ' ')}`);
    }
  }

  lines.push('');
  lines.push('The detailed PDF quote has been attached. Please let us know if you have any questions or wish to proceed!');

  return lines.join('\n');
}

function getCurrencyByCode(code) {
  if (!code) return { code: 'USD', name: 'US Dollar', symbol: '$' };
  const found = CURRENCIES.find((c) => c.code === String(code).toUpperCase());
  return found || { code: String(code).toUpperCase(), name: String(code).toUpperCase(), symbol: String(code).toUpperCase() };
}

function computeBaseAmountCents(amount, exchangeRate) {
  const amt = Number(amount) || 0;
  const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 1.0;
  return Math.round(amt * rate * 100);
}

function convertCurrency(amount, fromRate, toRate) {
  const amt = Number(amount) || 0;
  const fRate = Number(fromRate) > 0 ? Number(fromRate) : 1.0;
  const tRate = Number(toRate) > 0 ? Number(toRate) : 1.0;
  const baseAmount = amt * fRate;
  return Math.round((baseAmount / tRate) * 100) / 100;
}

if (typeof module !== 'undefined') {
  module.exports = {
    QUOTE_STATUSES,
    INVOICE_STATUSES,
    SEQUENCE_PREFIXES,
    CURRENCIES,
    NIGERIAN_BANKS,
    isValidNuban,
    getPaymentBankDetails,
    getCurrencyByCode,
    computeBaseAmountCents,
    convertCurrency,
    formatWhatsAppMoney,
    normalizeNigerianPhone,
    formatWhatsAppPhone,
    buildWhatsAppInvoiceMessage,
    buildWhatsAppQuoteMessage,
  };
}

if (typeof window !== 'undefined') {
  window.QuoteCraftConstants = {
    QUOTE_STATUSES,
    INVOICE_STATUSES,
    SEQUENCE_PREFIXES,
    CURRENCIES,
    NIGERIAN_BANKS,
    isValidNuban,
    getPaymentBankDetails,
    getCurrencyByCode,
    computeBaseAmountCents,
    convertCurrency,
    formatWhatsAppMoney,
    normalizeNigerianPhone,
    formatWhatsAppPhone,
    buildWhatsAppInvoiceMessage,
    buildWhatsAppQuoteMessage,
  };
}

