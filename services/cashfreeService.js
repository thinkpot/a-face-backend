const CashfreePG = require('cashfree-pg');

const cashfree = new CashfreePG({
  mode: 'TEST', // Change to 'PROD' for production
  appId: process.env.CASHFREE_APP_ID,  // Add these keys in your .env file
  secretKey: process.env.CASHFREE_SECRET_KEY,
});

module.exports = cashfree;
