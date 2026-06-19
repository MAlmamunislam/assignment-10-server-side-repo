const { ObjectId } = require("mongodb");
const express = require("express");
const app = express();
const cors = require("cors");
const port = 5000;
require("dotenv").config();

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");

app.get("/", (req, res) => {
  res.send("Multi-Purpose Prompt & Marketplace Server is Running!");
});

const uri = process.env.BETTER_AUTH_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let promptCollection, itemCollection, orgCollection;

async function run() {
  try {
    await client.connect();

    const database = client.db("prompt-hub");
    promptCollection = database.collection("prompts");
    itemCollection = database.collection("items");
    orgCollection = database.collection("organizations");
    const reportCollection = database.collection("reports");
    const bookmarkCollection = database.collection("bookmarks");

    // Bookmark Add API
    app.post("/api/bookmarks", async (req, res) => {
      try {
        const { promptId, userId, userEmail } = req.body;

        if (!promptId || !userId) {
          return res.status(400).send({
            success: false,
            message: "promptId and userId are required",
          });
        }

        const existing = await bookmarkCollection.findOne({
          promptId,
          userId,
        });

        if (existing) {
          return res.send({
            success: false,
            alreadyBookmarked: true,
            message: "Already bookmarked",
          });
        }

        const result = await bookmarkCollection.insertOne({
          promptId,
          userId,
          userEmail,
          createdAt: new Date(),
        });

        res.send({
          success: true,
          message: "Prompt bookmarked successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Internal Server Error",
        });
      }
    });

    // bookmark chek API

    app.get("/api/bookmarks/check", async (req, res) => {
      try {
        const { promptId, userId } = req.query;

        const bookmark = await bookmarkCollection.findOne({
          promptId,
          userId,
        });

        res.send({
          bookmarked: !!bookmark,
        });
      } catch (error) {
        res.status(500).send({
          bookmarked: false,
        });
      }
    });

    // Remove Bookmark API
    app.delete("/api/bookmarks", async (req, res) => {
      try {
        const { promptId, userId } = req.body;

        const result = await bookmarkCollection.deleteOne({
          promptId,
          userId,
        });

        res.send({
          success: true,
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Internal Server Error",
        });
      }
    });

    // My Bookmarks API

    app.get("/api/bookmarks/my-bookmarks", async (req, res) => {
      try {
        const userId = req.query.userId;

        const bookmarks = await bookmarkCollection
          .find({
            userId,
          })
          .toArray();

        res.send(bookmarks);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Internal Server Error",
        });
      }
    });

    // ইউজার যখন রিপোর্ট করবে
    app.post("/api/reports", async (req, res) => {
      try {
        const { promptId, userId, userName, reason, description } = req.body;
        const reportData = {
          promptId: new ObjectId(promptId),
          userId,
          userName,
          reason,
          description: description || "",
          status: "pending",
          createdAt: new Date(),
        };
        const result = await reportCollection.insertOne(reportData);
        res
          .status(201)
          .send({ success: true, message: "Report submitted successfully!" });
      } catch (error) {
        console.error("Error submitting report:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // অ্যাডমিন প্যানেলে রিপোর্টগুলো দেখার জন্য
    app.get("/api/admin/reports", async (req, res) => {
      const reports = await reportCollection.find().toArray();
      res.send(reports);
    });

    // নতুন প্রম্পট ডাটাবেজে সেভ করার API
    app.post("/api/prompts/add", async (req, res) => {
      try {
        const promptData = req.body;
        if (!promptData.userId || !promptData.title || !promptData.content) {
          return res
            .status(400)
            .send({ message: "Required fields are missing!" });
        }
        promptData.createdAt = new Date();
        promptData.rating = 0;
        promptData.totalRatings = 0;
        promptData.reviews = [];
        const result = await promptCollection.insertOne(promptData);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error adding prompt:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // অল পাবলিক ও অ্যাপ্রুভড প্রম্পট গেট করার API
    app.get("/api/prompts/public", async (req, res) => {
      try {
        const query = { status: "approved" };
        const cursor = promptCollection.find(query);
        const results = await cursor.toArray();
        res.send(results);
      } catch (error) {
        console.error("Error fetching public prompts:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // প্রম্পটে রিভিউ ও রেটিং যোগ করার API
    app.post("/api/prompts/:id/review", async (req, res) => {
      try {
        const promptId = req.params.id;
        const { name, email, image, rating, comment } = req.body;
        const query = { _id: new ObjectId(promptId) };
        const prompt = await promptCollection.findOne(query);
        if (!prompt) {
          return res.status(404).send({ message: "Prompt not found!" });
        }
        const newRatingInput = Number(rating);
        const currentTotalRatings = prompt.totalRatings || 0;
        const currentRating = prompt.rating || 0;
        const nextTotalRatings = currentTotalRatings + 1;
        const newAverageRating =
          (currentRating * currentTotalRatings + newRatingInput) /
          nextTotalRatings;
        const finalRating = Math.round(newAverageRating * 10) / 10;
        const newReview = {
          name,
          email,
          image, // ডাটাবেজে ইমেজ সেভ হবে
          rating: newRatingInput,
          comment,
          date: new Date(),
        };
        const updateDoc = {
          $set: { rating: finalRating, totalRatings: nextTotalRatings },
          $push: { reviews: newReview },
        };
        const result = await promptCollection.updateOne(query, updateDoc);
        res.send({
          success: true,
          message: "Review added successfully!",
          updatedRating: finalRating,
        });
      } catch (error) {
        console.error("Error adding review:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // নির্দিষ্ট প্রম্পটের ডিটেইলস দেখার ডায়নামিক রাউট
    app.get("/api/prompts/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // আইডি সঠিক কি না তা চেক করা
        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid ID format ok" });
        }

        const query = { _id: new ObjectId(id) };
        const prompt = await promptCollection.findOne(query);

        if (!prompt) {
          return res
            .status(404)
            .send({ success: false, message: "Prompt not found!" });
        }

        res.send(prompt);
      } catch (error) {
        console.error("Error fetching prompt details:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ফ্রি ইউজারের প্রম্পট লিমিট চেক করার API
    app.get("/api/user/prompt-count", async (req, res) => {
      try {
        const userId = req.query.userId;
        if (!userId) {
          return res
            .status(400)
            .send({ message: "userId query parameter is required" });
        }
        const count = await promptCollection.countDocuments({ userId: userId });
        res.send({ count });
      } catch (error) {
        console.error("Error counting prompts:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // প্রম্পটের কপি কাউন্ট ১ বাড়ানোর API
    app.patch("/api/prompts/copy/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid ID format" });
        }
        const query = { _id: new ObjectId(id) };
        const updateDoc = { $inc: { copyCount: 1 } };
        const result = await promptCollection.updateOne(query, updateDoc);
        if (result.modifiedCount === 1) {
          res.send({
            success: true,
            message: "Copy count updated successfully!",
          });
        } else {
          res.status(404).send({ success: false, message: "Prompt not found" });
        }
      } catch (error) {
        console.error("Error updating copy count:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // নির্দিষ্ট ইউজারের সব প্রম্পট খুঁজে বের করার API
    app.get("/api/user/my-prompts", async (req, res) => {
      try {
        const { userId } = req.query;

        if (!userId) {
          return res.status(400).send({
            message: "userId is required",
          });
        }

        const results = await promptCollection.find({ userId }).toArray();

        res.send(results);
      } catch (error) {
        console.error("Error fetching user prompts:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // প্রম্পট ডিলিট করার API
    app.delete("/api/prompts/delete/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid Prompt ID format" });
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

    // প্রম্পট আপডেট করার API
    app.put("/api/prompts/update/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { title, content } = req.body;
        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid Prompt ID format" });
        }
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { title, content, status: "pending" },
        };
        const result = await promptCollection.updateOne(filter, updateDoc);
        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "Prompt not found" });
        }
        res.send({ success: true, message: "Prompt updated successfully!" });
      } catch (error) {
        console.error("Error updating prompt:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running smoothly on port ${port}`);
});
