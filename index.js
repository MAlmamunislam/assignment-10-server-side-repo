const { ObjectId } = require('mongodb');
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

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let promptCollection, itemCollection, orgCollection;

async function run() {
  try {
    // ডাটাবেজের সাথে কানেক্ট হওয়া
    await client.connect();

    // 🎯 ডাটাবেজ এবং কালেকশন সেটআপ
    const database = client.db("prompt-hub"); 
    promptCollection = database.collection("prompts");       
    itemCollection = database.collection("items");           
    orgCollection = database.collection("organizations");     

    // ==========================================
    // 🚀 ১. প্রম্পট ড্যাশবোর্ডের API রাউটসমূহ
    // ==========================================

    // নতুন প্রম্পট ডাটাবেজে সেভ করার API
    app.post('/api/prompts/add', async (req, res) => {
      try {
        const promptData = req.body;
        console.log("📥 Received Prompt Data on Backend:", promptData);

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

    // প্রম্পটের কপি কাউন্ট ১ বাড়ানোর API
    app.patch('/api/prompts/copy/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const query = { _id: new ObjectId(id) };
        const updateDoc = { $inc: { copyCount: 1 } };

        const result = await promptCollection.updateOne(query, updateDoc);
        
        if (result.modifiedCount === 1) {
          res.send({ success: true, message: "Copy count updated successfully!" });
        } else {
          res.status(404).send({ success: false, message: "Prompt not found" });
        }
      } catch (error) {
        console.error("Error updating copy count:", error);
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

    // 🗑️ ১. প্রম্পট ডিলিট করার নিরাপদ API (DELETE)
    app.delete('/api/prompts/delete/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid Prompt ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await promptCollection.deleteOne(query);
        
        if (result.deletedCount === 1) {
          res.send({ success: true, message: "Prompt deleted successfully!" });
        } else {
          res.status(404).send({ success: false, message: "Prompt not found" });
        }
      } catch (error) {
        console.error("Error deleting prompt:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // 📝 ২. প্রম্পট আপডেট করার নিরাপদ API (PUT)
    app.put('/api/prompts/update/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid Prompt ID format" });
        }

        const filter = { _id: new ObjectId(id) };
        const updateFields = {};
        
        if (updatedData.title !== undefined) updateFields.title = updatedData.title;
        if (updatedData.description !== undefined) updateFields.description = updatedData.description;
        if (updatedData.content !== undefined) updateFields.content = updatedData.content;
        if (updatedData.category !== undefined) updateFields.category = updatedData.category;
        if (updatedData.aiTool !== undefined) updateFields.aiTool = updatedData.aiTool;
        if (updatedData.tags !== undefined) updateFields.tags = updatedData.tags;
        if (updatedData.difficulty !== undefined) updateFields.difficulty = updatedData.difficulty;
        if (updatedData.visibility !== undefined) updateFields.visibility = updatedData.visibility;
        
        updateFields.status = "pending"; 

        const updateDoc = { $set: updateFields };
        const result = await promptCollection.updateOne(filter, updateDoc);
        
        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: "Prompt not found" });
        }
        
        res.send({ success: true, message: "Prompt updated successfully!", result });
      } catch (error) {
        console.error("Error updating prompt:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ==================================================
    // 📦 ২. জেনারেক আইটেম ও অর্গানাইজেশন API
    // ==================================================

    app.post('/api/items', async (req, res) => {
      try {
        const item = req.body;
        const result = await itemCollection.insertOne(item);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    app.post('/api/organization', async (req, res) => {
      try {
        const organization = req.body;
        const result = await orgCollection.insertOne(organization);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

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

// 🎯 গ্লোবালি সার্ভার লিসেন শুরু (সবচেয়ে নিরাপদ নিয়ম)
app.listen(port, () => {
  console.log(`Server is running smoothly on port ${port}`);
});