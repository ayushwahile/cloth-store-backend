const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors()); // Allows your website to connect to the backend

// Connect to MongoDB
mongoose.connect('mongodb+srv://wahileayush:wahileayush0506@ayushcluster.el3krdl.mongodb.net/clothstore?retryWrites=true&w=majority&appName=AyushCluster')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define a generic schema for your data (e.g., transactions, products)
const dataSchema = new mongoose.Schema({
  ownerEmail: { type: String, required: true }, // To link data to the client’s email
  type: { type: String, required: true }, // e.g., "transaction", "product"
  data: { type: Object, required: true } // The actual data (flexible structure)
});

const Data = mongoose.model('Data', dataSchema);

// API to save data
app.post('/save-data', async (req, res) => {
  const { ownerEmail, type, data } = req.body;
  try {
    const newData = new Data({ ownerEmail, type, data });
    await newData.save();
    res.status(201).json({ message: 'Data saved successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Error saving data: ' + err.message });
  }
});

// API to retrieve data
app.get('/get-data/:ownerEmail/:type', async (req, res) => {
  const { ownerEmail, type } = req.params;
  try {
    const data = await Data.find({ ownerEmail, type });
    res.json(data.map(item => item.data));
  } catch (err) {
    res.status(500).json({ error: 'Error retrieving data: ' + err.message });
  }
});

// Start the backend server
app.listen(process.env.PORT || 3000, () => {
  console.log('Backend server running on http://localhost:' + (process.env.PORT || 3000));
});