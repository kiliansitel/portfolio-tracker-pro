const https = require('https');
const { dbRun, dbGet, dbAll } = require('../db');

// Exchange rate cache in memory
const rateCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

// Supported currencies
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF'];

// Currency symbols
const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CHF: 'CHF'
};

// Free exchange rate API (exchangerate-api.com free tier)
async function fetchExchangeRates() {
  const cacheKey = 'exchange_rates';
  const cached = rateCache.get(cacheKey);
  
  // Check cache first
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  // Check database cache
  const dbRates = dbAll('SELECT * FROM exchange_rates WHERE updated_at > ?', [
    new Date(Date.now() - CACHE_TTL).toISOString()
  ]);
  
  if (dbRates.length > 0) {
    const rates = {};
    dbRates.forEach(rate => {
      if (!rates[rate.base_currency]) rates[rate.base_currency] = {};
      rates[rate.base_currency][rate.target_currency] = rate.rate;
    });
    rateCache.set(cacheKey, { data: rates, timestamp: Date.now() });
    return rates;
  }
  
  // Fetch from API
  return new Promise((resolve) => {
    const url = 'https://api.exchangerate-api.com/v4/latest/USD';
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const rates = { USD: {} };
          
          // Convert API format to our format
          SUPPORTED_CURRENCIES.forEach(currency => {
            if (currency !== 'USD' && json.rates[currency]) {
              rates.USD[currency] = json.rates[currency];
            }
          });
          
          // Add reverse rates (e.g., EUR to USD)
          SUPPORTED_CURRENCIES.forEach(base => {
            if (base !== 'USD') {
              rates[base] = { USD: 1 / rates.USD[base] };
              
              // Cross rates (EUR to GBP, etc.)
              SUPPORTED_CURRENCIES.forEach(target => {
                if (target !== base && target !== 'USD') {
                  rates[base][target] = rates.USD[target] / rates.USD[base];
                }
              });
            }
          });
          
          // Cache in database
          const timestamp = new Date().toISOString();
          Object.keys(rates).forEach(base => {
            Object.keys(rates[base]).forEach(target => {
              const rate = rates[base][target];
              try {
                dbRun(`
                  INSERT OR REPLACE INTO exchange_rates (base_currency, target_currency, rate, updated_at)
                  VALUES (?, ?, ?, ?)
                `, [base, target, rate, timestamp]);
              } catch (e) {
                console.error('Error saving exchange rate:', e);
              }
            });
          });
          
          // Cache in memory
          rateCache.set(cacheKey, { data: rates, timestamp: Date.now() });
          resolve(rates);
        } catch (e) {
          console.error('Error parsing exchange rates:', e);
          resolve({});
        }
      });
    }).on('error', () => {
      console.error('Error fetching exchange rates');
      resolve({});
    });
  });
}

// Convert amount from one currency to another
function convertCurrency(amount, fromCurrency, toCurrency, rates) {
  if (!amount || fromCurrency === toCurrency) {
    return amount;
  }
  
  if (!rates[fromCurrency] || !rates[fromCurrency][toCurrency]) {
    console.warn(`Exchange rate not found: ${fromCurrency} -> ${toCurrency}`);
    return amount; // Return original amount if conversion not available
  }
  
  return amount * rates[fromCurrency][toCurrency];
}

// Get currency symbol
function getCurrencySymbol(currency) {
  return CURRENCY_SYMBOLS[currency] || currency;
}

// Format price with currency symbol
function formatPrice(amount, currency) {
  const symbol = getCurrencySymbol(currency);
  const formatted = amount.toFixed(2);
  
  switch (currency) {
    case 'USD':
      return `$${formatted}`;
    case 'EUR':
      return `€${formatted}`;
    case 'GBP':
      return `£${formatted}`;
    case 'CHF':
      return `CHF ${formatted}`;
    default:
      return `${symbol}${formatted}`;
  }
}

module.exports = {
  fetchExchangeRates,
  convertCurrency,
  getCurrencySymbol,
  formatPrice,
  SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS
};