const express = require('express');
const app = express();
const cors = require('cors'); 
const port = 5000;
require('dotenv').config();

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require('mongodb');

app.get('/', (req, res) => {
  res.send('Multi-Purpose Prompt & Marketplace Server is Running!');
});

const uri = process.env.BETTER_AUTH_URI;

// MongoClient তৈরি
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // ডাটাবেজের সাথে কানেক্ট হওয়া
    await client.connect();

    // 🎯 ডাটাবেজ এবং কালেকশন সেটআপ
    const database = client.db("prompt-hub"); 
    const promptCollection = database.collection("prompts");       // প্রম্পট কালেকশন
    const itemCollection = database.collection("items");           // 🔄 (আগের jobs) জেনারেক আইটেম কালেকশন
    const orgCollection = database.collection("organizations");     // 🔄 (আগের companies) অর্গানাইজেশন কালেকশন

    // ==========================================
    // 🚀 ১. প্রম্পট ড্যাশবোর্ডের API রাউটসমূহ
    // ==========================================

    // নতুন প্রম্পট ডাটাবেজে সেভ করার API
    app.post('/api/prompts/add', async (req, res) => {
      try {
        const promptData = req.body;
        if (!promptData.userId || !promptData.title || !promptData.content) {
          return res.status(400).send({ message: "Required fields are missing!" });
        }
        const result = await promptCollection.insertOne(promptData);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error adding prompt:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ফ্রি ইউজারের ৩টি প্রম্পট লিমিট চেক করার API (Count)
    app.get('/api/user/prompt-count', async (req, res) => {
      try {
        const userId = req.query.userId;
        if (!userId) {
          return res.status(400).send({ message: "userId query parameter is required" });
        }
        const count = await promptCollection.countDocuments({ userId: userId });
        res.send({ count });
      } catch (error) {
        console.error("Error counting prompts:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // নির্দিষ্ট ইউজারের সব প্রম্পট খুঁজে বের করার API (My Prompts পেজের জন্য)
    app.get('/api/prompts/my-prompts', async (req, res) => {
      try {
        const userId = req.query.userId;
        let query = {};
        if (userId) {
          query.userId = userId;
        }
        const cursor = promptCollection.find(query);
        const results = await cursor.toArray();
        res.send(results);
      } catch (error) {
        console.error("Error fetching user prompts:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });


    // ==================================================
    // 📦 ২. জেনারেক আইটেম ও অর্গানাইজেশন API (আগের কোড - রিনেমড)
    // ==================================================

    // নতুন আইটেম বা পোস্ট তৈরি করার API (আগের post job)
    app.post('/api/items', async (req, res) => {
      try {
        const item = req.body;
        const result = await itemCollection.insertOne(item);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // নতুন অর্গানাইজেশন বা প্রোফাইল নাম সেভ করার API (আগের post company)
    app.post('/api/organization', async (req, res) => {
      try {
        const organization = req.body;
        const result = await orgCollection.insertOne(organization);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // ক্রিয়েটর বা রিক্রুটার আইডি দিয়ে নির্দিষ্ট অর্গানাইজেশন খোঁজার API (আগের get company - বাগ ফিক্সড)
    app.get('/api/my/organization', async (req, res) => {
      try {
        let query = {}; 
        if (req.query.creatorId) {
          query.creatorId = req.query.creatorId; 
        }
        const results = await orgCollection.findOne(query);
        res.send(results);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    // নির্দিষ্ট অর্গানাইজেশনের আন্ডারে থাকা সব আইটেম খোঁজার API (আগের get jobs)
    app.get('/api/items', async (req, res) => {
      try {
        let query = {};
        if (req.query.orgId) {
          query.orgId = req.query.orgId;
        }
        const cursor = itemCollection.find(query);
        const results = await cursor.toArray();
        res.send(results);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });


    // MongoDB কানেকশন চেক পিং
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("Database connection error:", error);
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running smoothly on port ${port}`);
});