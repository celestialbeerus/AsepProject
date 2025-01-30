import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import Groq from 'groq-sdk';
import bcrypt from 'bcryptjs';

// Import MongoDB models
import Email from './models/item.js';
import User from './models/user.js';

// Load environment variables
dotenv.config();

// Get __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve static frontend files

// Validate required environment variables
if (!process.env.MONGODB_URI || !process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.GROQ_API_KEY) {
  console.error('Error: Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Serve frontend homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API to register a new user
app.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required.' });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save the user
    const newUser = new User({ email, password: hashedPassword, name });
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Error during registration:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// API to generate and store an email with tracking pixel
app.post('/generate-email', async (req, res) => {
  const { recipient, subject, body } = req.body;
  if (!recipient || !subject || !body) {
    return res.status(400).json({ error: 'Recipient, subject, and body are required.' });
  }

  try {
    const newEmail = new Email({ recipient, subject, body });
    await newEmail.save();
    const emailId = newEmail._id;

    // Add tracking pixel to email body
    const trackingPixel = `http://localhost:${PORT}/track-open/${emailId}`;
    newEmail.body = `${body}<img src="${trackingPixel}" width="1" height="1" style="display:none;" />`;
    await newEmail.save();

    res.status(201).json({ message: 'Email generated successfully', email: newEmail });
  } catch (error) {
    console.error('Error saving email:', error);
    res.status(500).json({ error: 'Error saving email: ' + error.message });
  }
});

// API to send an email using Nodemailer
app.post('/send-email', async (req, res) => {
  const { recipient, subject, body } = req.body;
  if (!recipient || !subject || !body) {
    return res.status(400).json({ error: 'Recipient, subject, and body are required.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipient,
      subject,
      html: body,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);
    res.status(200).json({ message: 'Email sent successfully!', info });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email: ' + error.message });
  }
});

// API to track email opens
app.get('/track-open/:id', async (req, res) => {
  try {
    const emailId = req.params.id;
    await Email.findByIdAndUpdate(emailId, { opened: true });
    res.sendStatus(200);
  } catch (error) {
    console.error('Error tracking email:', error);
    res.sendStatus(500);
  }
});

// Cron job to check for unopened emails and send follow-ups
cron.schedule('0 0 * * *', async () => {
  try {
    const unopenedEmails = await Email.find({ opened: false });
    unopenedEmails.forEach(email => {
      console.log(`Follow-up reminder for ${email.recipient}`);
    });
  } catch (error) {
    console.error('Error running cron job:', error);
  }
});

// Initialize Groq AI
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// API to scrape LinkedIn data and generate an AI-powered email
app.post('/scrape-and-generate', async (req, res) => {
  const { linkedinUrl, purpose, userData } = req.body;
  if (!linkedinUrl || !purpose || !userData || !userData.name || !userData.position || !userData.organization) {
    return res.status(400).json({ error: 'LinkedIn URL, purpose, and complete user details are required.' });
  }

  try {
    // Call the Flask web scraper API
    const flaskResponse = await axios.post('http://127.0.0.1:5000/scrape_linkedin_company', {
      url: linkedinUrl
    });

    if (flaskResponse.data.error) {
      return res.status(500).json({ error: flaskResponse.data.error });
    }

    const scrapedData = flaskResponse.data;

    // Enhanced email prompt with additional details
    const emailPrompt = `
    You are an AI email generator tasked with crafting a personalized email on behalf of an individual representing an organization.
    Use the provided sender details to address the sender and consider incorporating the recipient's organization details (${scrapedData.companyName}) for context.
    Remember, you are addressing the recipient as the 'recruitment team'.
    Keep the tone natural, casual, and concise. Start the email with a relevant quote.

    Sender Details:
    - Name: ${userData.name}
    - Position: ${userData.position}
    - Organization: ${userData.organization}

    Recipient Details:
    - Company Name: ${scrapedData.companyName}
    - Website: ${scrapedData.website}
    - Industry: ${scrapedData.industry}
    - Specialties: ${scrapedData.specialties}
    - Company Size: ${scrapedData.companySize}

    Purpose of the email: ${purpose}

    Avoid placeholders; this email will be sent directly.
    `;

    // Generate email content using Groq AI
    const completions = await groq.chat.completions.create({
      model: "mixtral-8x7b-32768",  
      messages: [
        {
          role: "system",
          content: `You are an AI email generator. Craft a concise, natural-sounding email for recruitment purposes. Address the sender and use company data for context. Keep it short and direct. Start with a quote.`,
        },
        {
          role: "user",
          content: emailPrompt,
        }
      ],
      max_tokens: 500
    });

    res.status(200).json({ email: completions.choices[0].message.content });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
