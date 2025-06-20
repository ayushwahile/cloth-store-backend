const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios'); // Added for Fast2SMS API requests
require('dotenv').config(); // Added to load environment variables

const app = express();

app.use(express.json());
app.use(cors()); // Allows your website to connect to the backend

// Hardcode the owner's phone number
const OWNER_PHONE_NUMBER = "7276099625";

// Load Fast2SMS API key from environment variables
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || 'EkqoTCwPlzqCgY8escbyntH2wc9kwSOT33009jjrqWjRTJnsag8bQg726Wt4';

// Connect to MongoDB
mongoose.connect('mongodb+srv://wahileayush:wahileayush0506@ayushcluster.el3krdl.mongodb.net/clothstore?retryWrites=true&w=majority&appName=AyushCluster')
  .then(async () => {
    console.log('Connected to MongoDB');

    // Ensure unique index on the phone field in the forms collection
    try {
      await mongoose.connection.db.collection('forms').createIndex(
        { phone: 1 },
        { unique: true }
      );
      console.log('Unique index on phone field ensured in forms collection');
    } catch (err) {
      console.error('Error creating unique index on phone field:', err);
    }

    // Clean up duplicate phone numbers in the forms collection (one-time operation)
    try {
      const duplicates = await mongoose.connection.db.collection('forms').aggregate([
        { $group: { _id: "$phone", ids: { $addToSet: "$_id" }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
      ]).toArray();

      if (duplicates.length > 0) {
        console.log(`Found ${duplicates.length} phone numbers with duplicates. Cleaning up...`);
        for (const duplicate of duplicates) {
          const idsToRemove = duplicate.ids.slice(1); // Keep the first document, remove the rest
          await mongoose.connection.db.collection('forms').deleteMany({
            _id: { $in: idsToRemove }
          });
          console.log(`Removed duplicates for phone: ${duplicate._id}`);
        }
        console.log('Duplicate cleanup completed');
      } else {
        console.log('No duplicate phone numbers found in forms collection');
      }
    } catch (err) {
      console.error('Error cleaning up duplicates in forms collection:', err);
    }
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Schema for Forms (created in form.html, shown in details.html)
const formSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true }, // 10-digit phone number
  name: { type: String, required: true },
  date: { type: String, required: true },
  products: [{
    brandName: String,
    productName: String,
    size: String,
    mrp: Number,
    selectedFloor: String,
    checked: { type: Boolean, default: false } // For border change in details.html
  }],
  paid: { type: Boolean, default: false }, // For payment status
  paymentDate: String // Added to store payment date
});

const Form = mongoose.model('Form', formSchema);

// Schema for Sells (history in sells.html)
const sellSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  name: { type: String, required: true },
  date: { type: String, required: true },
  total: { type: Number, required: true },
  products: [{
    brandName: String,
    productName: String,
    size: String,
    mrp: Number,
    selectedFloor: String // Added to match formSchema and store selectedFloor
  }],
  paymentDate: { type: Date, required: true } // Changed to Date for proper sorting
});

const Sell = mongoose.model('Sell', sellSchema);

// Schema for Products (used in products.html)
const productSchema = new mongoose.Schema({
  brandName: { type: String, required: true },
  productName: { type: String, required: true },
  size: { type: String, required: true },
  originalMrp: { type: Number, required: true }, // Store the original MRP entered by the owner
  adjustedMrp: { type: Number, required: true }  // Store the adjusted MRP (original + 10)
});

const Product = mongoose.model('Product', productSchema);

// Schema for Owner's Bank Balance (added for bank_payment.html)
const ownerBalanceSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, unique: true }, // For simplicity, use a fixed ownerId
  balance: { type: Number, default: 0 }
});

const OwnerBalance = mongoose.model('OwnerBalance', ownerBalanceSchema);

// Schema for Pending Payments (used in pendingpayment.html and owner_home.html)
const pendingPaymentSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  timestamp: { type: String, required: true },
  paid: { type: Boolean, default: false }
});

const PendingPayment = mongoose.model('PendingPayment', pendingPaymentSchema);

// Schema for OTP Sessions (used in owner.html and search.html)
const otpSessionSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
  verified: { type: Boolean, default: false }
});

const OTPSession = mongoose.model('OTPSession', otpSessionSchema);

// API to create or update a form (used in form.html and details.html)
app.post('/forms', async (req, res) => {
  const { phone, name, date, products } = req.body;
  try {
    let form = await Form.findOne({ phone });
    if (form) {
      // Update existing form (e.g., add products)
      if (products) {
        form.products = [...form.products, ...products];
      }
      await form.save();
      res.json(form);
    } else {
      // Create new form
      form = new Form({ phone, name, date, products: products || [] });
      await form.save();
      res.status(201).json(form);
    }
  } catch (err) {
    res.status(500).json({ error: 'Error saving form: ' + err.message });
  }
});

// API to get all forms (used in search.html and search_.html)
app.get('/forms', async (req, res) => {
  try {
    const fields = req.query.fields; // Check for fields query parameter
    let forms;
    if (fields === 'phone') {
      forms = await Form.find({}, 'phone'); // Only fetch phone numbers
    } else {
      forms = await Form.find(); // Fetch full form data
    }
    res.json(forms);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving forms: ' + err.message });
  }
});

// API to get a form by phone number (used in search.html, search_.html, owner_home.html)
app.get('/forms/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const form = await Form.findOne({ phone });
    if (form) {
      res.json(form);
    } else {
      res.status(404).json({ error: 'Form not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving form: ' + err.message });
  }
});

// API to update product checked status (used in details.html for second user)
app.put('/forms/:phone/check-product', async (req, res) => {
  const { phone } = req.params;
  const { productIndex } = req.body;
  try {
    const form = await Form.findOne({ phone });
    if (form && form.products[productIndex]) {
      form.products[productIndex].checked = true;
      await form.save();
      res.json(form);
    } else {
      res.status(404).json({ error: 'Form or product not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error updating product: ' + err.message });
  }
});

// API to mark form as paid (used in bank_payment.html)
app.put('/forms/:phone/paid', async (req, res) => {
  const { phone } = req.params;
  const { paymentDate, products } = req.body; // Include products from the request
  try {
    const form = await Form.findOne({ phone });
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    console.log('Received paymentDate:', paymentDate);
    form.paid = true;
    form.paymentDate = paymentDate; // Save the payment date
    await form.save();

    // Save to sells history
    const total = form.products.reduce((sum, p) => sum + (p.mrp || 0), 0);
    const sell = new Sell({
      phone: form.phone,
      name: form.name,
      date: form.date,
      total,
      products: form.products.map(product => ({
        brandName: product.brandName,
        productName: product.productName,
        size: product.size,
        mrp: product.mrp,
        selectedFloor: product.selectedFloor || ''
      })),
      paymentDate: new Date(paymentDate) // Convert string to Date
    });
    await sell.save();
    console.log('Saved sell with paymentDate:', sell.paymentDate);

    // Update owner's bank balance
    let ownerBalance = await OwnerBalance.findOne({ ownerId: 'owner' });
    if (!ownerBalance) {
      ownerBalance = new OwnerBalance({ ownerId: 'owner', balance: 0 });
    }
    ownerBalance.balance += total;
    await ownerBalance.save();

    // Delete the form from the forms collection after payment
    const deleteResult = await Form.deleteOne({ phone });
    if (deleteResult.deletedCount === 1) {
      console.log(`Successfully deleted form with phone number ${phone} after payment`);
    } else {
      console.warn(`Form with phone number ${phone} was not found for deletion after payment`);
    }

    res.json(form);
  } catch (err) {
    console.error('Error in marking form as paid:', err.message);
    res.status(500).json({ error: 'Error marking as paid: ' + err.message });
  }
});

// API to get sells history (used in sells.html and products.html for sales history)
app.get('/sells', async (req, res) => {
  try {
    const sells = await Sell.find().sort({ paymentDate: -1 }); // Sort by paymentDate in descending order (newest first)
    console.log('Fetched sells:', sells.map(sell => ({ phone: sell.phone, paymentDate: sell.paymentDate })));
    res.json(sells);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving sells: ' + err.message });
  }
});

// API to get shopping history by phone (used in shopping.html)
app.get('/shopping/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const sells = await Sell.find({ phone }).sort({ paymentDate: -1 }); // Sort by paymentDate in descending order
    res.json(sells);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving shopping history: ' + err.message });
  }
});

// API to get all products (used in products.html and details.html)
app.get('/products', async (req, res) => {
  try {
    const products = await Product.find();
    // Map products to maintain backward compatibility with existing code expecting 'mrp'
    const formattedProducts = products.map(product => ({
      ...product._doc,
      mrp: product.adjustedMrp // Add mrp field for backward compatibility
    }));
    res.json(formattedProducts);
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving products: ' + err.message });
  }
});

// API to create a new product (used in products.html)
app.post('/products', async (req, res) => {
  const { brandName, productName, size, mrp } = req.body;
  try {
    const originalMrp = Number(mrp);
    const adjustedMrp = originalMrp + 10; // Add 10 Rs to the MRP for the additional fee
    console.log(`Creating product with original MRP: ${originalMrp}, adjusted MRP: ${adjustedMrp}`);
    const product = new Product({ brandName, productName, size, originalMrp, adjustedMrp });
    await product.save();
    // Add mrp field to response for backward compatibility
    res.status(201).json({ ...product._doc, mrp: adjustedMrp });
  } catch (err) {
    res.status(500).json({ error: 'Error creating product: ' + err.message });
  }
});

// API to update a product (used in products.html)
app.put('/products/:id', async (req, res) => {
  const { id } = req.params;
  const { brandName, productName, size, mrp } = req.body;
  try {
    const originalMrp = Number(mrp);
    const adjustedMrp = originalMrp + 10; // Add 10 Rs to the MRP for the additional fee
    console.log(`Updating product ID: ${id} with original MRP: ${originalMrp}, adjusted MRP: ${adjustedMrp}`);
    const product = await Product.findByIdAndUpdate(
      id,
      { brandName, productName, size, originalMrp, adjustedMrp },
      { new: true }
    );
    if (product) {
      // Add mrp field to response for backward compatibility
      res.json({ ...product._doc, mrp: adjustedMrp });
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error updating product: ' + err.message });
  }
});

// API to delete a product (used in products.html)
app.delete('/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const product = await Product.findByIdAndDelete(id);
    if (product) {
      res.json({ message: 'Product deleted' });
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error deleting product: ' + err.message });
  }
});

// API to get owner's bank balance (added for bank_payment.html)
app.get('/owner-balance', async (req, res) => {
  try {
    const ownerBalance = await OwnerBalance.findOne({ ownerId: 'owner' });
    if (ownerBalance) {
      res.json({ balance: ownerBalance.balance });
    } else {
      const newBalance = new OwnerBalance({ ownerId: 'owner', balance: 0 });
      await newBalance.save();
      res.json({ balance: 0 });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving balance: ' + err.message });
  }
});

// API to update owner's bank balance (added for bank_payment.html)
app.put('/owner-balance', async (req, res) => {
  const { amount } = req.body;
  try {
    let ownerBalance = await OwnerBalance.findOne({ ownerId: 'owner' });
    if (!ownerBalance) {
      ownerBalance = new OwnerBalance({ ownerId: 'owner', balance: 0 });
    }
    ownerBalance.balance += amount;
    await ownerBalance.save();
    res.json({ balance: ownerBalance.balance });
  } catch (err) {
    res.status(500).json({ error: 'Error updating balance: ' + err.message });
  }
});

// Razorpay integration
const Razorpay = require('razorpay');
const razorpay = new Razorpay({
  key_id: 'rzp_test_2TQGkf0MgdCKqg', // Your test API key
  key_secret: 'uoIibpGn0Me560q0oRodQjrL' // Your test API secret
});

// API to create a payment link
app.post('/create-payment-link', async (req, res) => {
  const { amount, customerName, customerPhone } = req.body;
  try {
    if (!amount || !customerName || !customerPhone) {
      throw new Error('Amount, customer name, and phone are required');
    }

    const paymentLink = await razorpay.paymentLink.create({
      amount: amount * 100, // Amount in paise (e.g., 1000 paise = 10 INR)
      currency: 'INR',
      description: `Payment for ${customerName}`,
      customer: {
        name: customerName,
        contact: customerPhone
      },
      notify: {
        sms: true,
        email: false
      },
      notes: {
        type: 'purchase' // Optional: Add context for the payment
      }
    });
    res.json({ paymentLink: paymentLink.short_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API to verify payment
app.post('/verify-payment', async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
  try {
    const generated_signature = require('crypto')
      .createHmac('sha256', 'uoIibpGn0Me560q0oRodQjrL') // Your test API secret
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature === razorpay_signature) {
      res.json({ status: 'success', message: 'Payment verified successfully' });
    } else {
      res.status(400).json({ status: 'failure', message: 'Payment verification failed' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error verifying payment: ' + err.message });
  }
});

// API to save a pending payment
app.post('/pending-payments', async (req, res) => {
  const { amount, timestamp } = req.body;
  try {
    const pendingPayment = new PendingPayment({ amount, timestamp });
    await pendingPayment.save();
    console.log(`Saved pending payment: amount=${amount}, timestamp=${timestamp}`);
    res.status(201).json({ message: 'Pending payment saved successfully', timestamp });
  } catch (err) {
    console.error('Error saving pending payment:', err);
    res.status(500).json({ error: 'Error saving pending payment: ' + err.message });
  }
});

// API to get the most recent unpaid pending payment
app.get('/pending-payments/most-recent', async (req, res) => {
  try {
    const pendingPayment = await PendingPayment.findOne({ paid: false })
      .sort({ timestamp: -1 }); // Sort by timestamp in descending order (most recent first)
    if (pendingPayment) {
      console.log('Fetched most recent unpaid pending payment:', pendingPayment);
      res.json(pendingPayment);
    } else {
      res.json(null); // Return null if no unpaid pending payments exist
    }
  } catch (err) {
    console.error('Error retrieving most recent pending payment:', err);
    res.status(500).json({ error: 'Error retrieving pending payment: ' + err.message });
  }
});

// API to get pending payments for the previous day (kept for backward compatibility)
app.get('/pending-payments/previous-day', async (req, res) => {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStart = yesterday.toISOString().split('T')[0]; // e.g., "2025-06-15"

    const pendingPayments = await PendingPayment.find({
      timestamp: { $gte: `${yesterdayStart}T00:00:00.000Z`, $lt: `${yesterdayStart}T23:59:59.999Z` },
      paid: false
    });

    console.log('Fetched previous day pending payments:', pendingPayments);
    res.json(pendingPayments);
  } catch (err) {
    console.error('Error retrieving previous day pending payments:', err);
    res.status(500).json({ error: 'Error retrieving pending payments: ' + err.message });
  }
});

// API to get pending payments for a specific date
app.get('/pending-payments', async (req, res) => {
  const { date } = req.query; // Expect date in format "YYYY-MM-DD" (e.g., "2025-06-16")
  try {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid or missing date parameter. Use format YYYY-MM-DD' });
    }

    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    const pendingPayments = await PendingPayment.find({
      timestamp: { $gte: startOfDay, $lte: endOfDay },
      paid: false
    });

    console.log(`Fetched pending payments for ${date}:`, pendingPayments);
    res.json(pendingPayments);
  } catch (err) {
    console.error(`Error retrieving pending payments for ${date}:`, err);
    res.status(500).json({ error: 'Error retrieving pending payments: ' + err.message });
  }
});

// API to mark a single pending payment as paid
app.put('/pending-payments/pay', async (req, res) => {
  const { timestamp } = req.body;
  try {
    const pendingPayment = await PendingPayment.findOneAndUpdate(
      { timestamp, paid: false },
      { paid: true },
      { new: true }
    );
    if (pendingPayment) {
      // Update owner's bank balance for pending payment
      let ownerBalance = await OwnerBalance.findOne({ ownerId: 'owner' });
      if (!ownerBalance) {
        ownerBalance = new OwnerBalance({ ownerId: 'owner', balance: 0 });
      }
      ownerBalance.balance += pendingPayment.amount;
      await ownerBalance.save();

      console.log(`Marked pending payment as paid: timestamp=${timestamp}, amount=${pendingPayment.amount}, new owner balance=${ownerBalance.balance}`);
      res.json({ message: 'Pending payment marked as paid', balance: ownerBalance.balance });
    } else {
      console.warn(`Pending payment not found or already paid: timestamp=${timestamp}`);
      res.status(404).json({ error: 'Pending payment not found or already paid' });
    }
  } catch (err) {
    console.error('Error marking payment as paid:', err);
    res.status(500).json({ error: 'Error marking payment as paid: ' + err.message });
  }
});

// API to mark all pending payments for a specific date as paid
app.put('/pending-payments/pay-by-date', async (req, res) => {
  const { date } = req.body; // Expect date in format "YYYY-MM-DD" (e.g., "2025-06-16")
  try {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid or missing date parameter. Use format YYYY-MM-DD' });
    }

    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    // Find all unpaid pending payments for the specified date
    const pendingPayments = await PendingPayment.find({
      timestamp: { $gte: startOfDay, $lte: endOfDay },
      paid: false
    });

    if (pendingPayments.length === 0) {
      console.warn(`No unpaid pending payments found for ${date}`);
      return res.status(404).json({ error: 'No unpaid pending payments found for the specified date' });
    }

    // Calculate the total amount
    const totalAmount = pendingPayments.reduce((sum, payment) => sum + payment.amount, 0);

    // Mark all payments as paid
    await PendingPayment.updateMany(
      {
        timestamp: { $gte: startOfDay, $lte: endOfDay },
        paid: false
      },
      { paid: true }
    );

    // Update owner's bank balance with the total amount
    let ownerBalance = await OwnerBalance.findOne({ ownerId: 'owner' });
    if (!ownerBalance) {
      ownerBalance = new OwnerBalance({ ownerId: 'owner', balance: 0 });
    }
    ownerBalance.balance += totalAmount;
    await ownerBalance.save();

    console.log(`Marked all pending payments as paid for ${date}: totalAmount=${totalAmount}, new owner balance=${ownerBalance.balance}`);
    res.json({ message: `All pending payments for ${date} marked as paid`, totalAmount, balance: ownerBalance.balance });
  } catch (err) {
    console.error(`Error marking payments as paid for ${date}:`, err);
    res.status(500).json({ error: 'Error marking payments as paid: ' + err.message });
  }
});

// API to send OTP for owner (used in owner.html, restricted to OWNER_PHONE_NUMBER)
app.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  try {
    // Validate phone number
    if (!phone || phone.length !== 10 || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number. Must be a 10-digit number.' });
    }

    // Check if phone matches the owner's phone number
    if (phone !== OWNER_PHONE_NUMBER) {
      return res.status(403).json({ error: 'Phone number does not match the owner\'s phone number.' });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Calculate expiration time (10 minutes from now)
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing OTP sessions for this phone number
    await OTPSession.deleteMany({ phone });

    // Save the OTP session
    const otpSession = new OTPSession({
      phone,
      otp,
      createdAt,
      expiresAt,
      verified: false
    });
    await otpSession.save();

    // Send OTP via Fast2SMS
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'otp',
        variables_values: otp,
        numbers: phone,
        flash: 0
      },
      {
        headers: {
          authorization: FAST2SMS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.return !== true) {
      console.error('Fast2SMS Error Details:', response.data);
      return res.status(500).json({ 
        error: 'Failed to send OTP via SMS.', 
        details: response.data.message || 'Unknown error from Fast2SMS'
      });
    }

    console.log(`OTP sent to ${phone}: ${otp}`); // Log for debugging (remove in production)
    res.status(200).json({ message: 'OTP sent successfully' }); // Do not return OTP in production
  } catch (err) {
    console.error('Error sending OTP:', err.message);
    res.status(500).json({ error: 'Error sending OTP: ' + err.message });
  }
});

// API to send OTP for form creation (used in search.html and shopping.html, allows any 10-digit phone number)
app.post('/send-otp-form', async (req, res) => {
  const { phone } = req.body;
  try {
    // Validate phone number
    if (!phone || phone.length !== 10 || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid phone number. Must be a 10-digit number.' });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Calculate expiration time (10 minutes from now)
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing OTP sessions for this phone number
    await OTPSession.deleteMany({ phone });

    // Save the OTP session
    const otpSession = new OTPSession({
      phone,
      otp,
      createdAt,
      expiresAt,
      verified: false
    });
    await otpSession.save();

    // Send OTP via Fast2SMS
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'otp',
        variables_values: otp,
        numbers: phone,
        flash: 0
      },
      {
        headers: {
          authorization: FAST2SMS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data.return !== true) {
      console.error('Fast2SMS Error Details:', response.data);
      return res.status(500).json({ 
        error: 'Failed to send OTP via SMS.', 
        details: response.data.message || 'Unknown error from Fast2SMS'
      });
    }

    console.log(`OTP sent to ${phone}: ${otp}`); // Log for debugging (remove in production)
    res.status(200).json({ message: 'OTP sent successfully' }); // Do not return OTP in production
  } catch (err) {
    console.error('Error sending OTP for form creation:', err.message);
    res.status(500).json({ error: 'Error sending OTP: ' + err.message });
  }
});

// API to verify OTP (used in owner.html, search.html, and shopping.html)
app.post('/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;
  try {
    // Validate inputs
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone number and OTP are required.' });
    }

    // Find the most recent OTP session for this phone number
    const otpSession = await OTPSession.findOne({ phone }).sort({ createdAt: -1 });

    if (!otpSession) {
      return res.status(404).json({ error: 'No OTP session found for this phone number.' });
    }

    // Check if OTP has expired
    const now = new Date();
    if (now > otpSession.expiresAt) {
      return res.status(400).json({ error: 'OTP has expired.' });
    }

    // Check if OTP has already been verified
    if (otpSession.verified) {
      return res.status(400).json({ error: 'OTP has already been used.' });
    }

    // Verify the OTP
    if (otpSession.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP.' });
    }

    // Mark the OTP session as verified
    otpSession.verified = true;
    await otpSession.save();

    // Delete the OTP session after successful verification
    await OTPSession.deleteOne({ _id: otpSession._id });

    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (err) {
    console.error('Error verifying OTP:', err.message);
    res.status(500).json({ error: 'Error verifying OTP: ' + err.message });
  }
});

// Start the backend server
app.listen(process.env.PORT || 3000, () => {
  console.log('Backend server running on http://localhost:' + (process.env.PORT || 3000));
});