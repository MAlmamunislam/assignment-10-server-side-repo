const { ObjectId } = require("mongodb");
const express = require("express");
const app = express();
const cors = require("cors");
const port = 5000;
require("dotenv").config();

// app.use(cors());
const allowedOrigins = [
  'http://localhost:3000',
  'https://assignment-10-client-side-repo.vercel.app'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));


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

let promptCollection, itemCollection, orgCollection,premiumRecordsCollection, usersCollection;

async function run() {
  try {
    // await client.connect();

    const database = client.db("prompt-hub");
    const userDb = client.db("PromptHub"); 
    promptCollection = database.collection("prompts");
    itemCollection = database.collection("items");
    orgCollection = database.collection("organizations");
    const reportCollection = database.collection("reports");
    const bookmarkCollection = database.collection("bookmarks");
   usersCollection = userDb.collection("user");
premiumRecordsCollection = database.collection("premium_records");

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







// for admin route 


// admin get user list
app.get("/api/users", async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.send(users);
});

// user can change role
app.patch("/api/users/role/:id", async (req, res) => {
  const id = req.params.id;
  const { role } = req.body;
  const filter = { _id: new ObjectId(id) };
  const updateDoc = { $set: { role: role } };
  const result = await usersCollection.updateOne(filter, updateDoc);
  res.send(result);
});

// ৩. প্রম্পট অ্যাপ্রুভ/রিজেক্ট/ফিচার করার জন্য (অ্যাডমিন)
app.patch("/api/prompts/status/:id", async (req, res) => {
  const id = req.params.id;
  const { status, feedback } = req.body; // status: 'approved'/'rejected', feedback: '...'
  const filter = { _id: new ObjectId(id) };
  const updateDoc = { $set: { status: status, feedback: feedback } };
  const result = await promptCollection.updateOne(filter, updateDoc);
  res.send(result);
});

// ৪. অ্যাডমিন অ্যানালিটিক্স (Dashboard)
app.get("/api/admin/stats", async (req, res) => {
  const totalUsers = await usersCollection.countDocuments();
  const totalPrompts = await promptCollection.countDocuments();
  const totalReviews = await promptCollection.aggregate([
      { $unwind: "$reviews" },
      { $count: "total" }
  ]).toArray();
  
  const totalCopies = await promptCollection.aggregate([
      { $group: { _id: null, sum: { $sum: "$copyCount" } } }
  ]).toArray();

  res.send({
      totalUsers,
      totalPrompts,
      totalReviews: totalReviews.length > 0 ? totalReviews[0].total : 0,
      totalCopies: totalCopies.length > 0 ? totalCopies[0].sum : 0
  });
});





// admin counter 
app.get("/api/admin/stats", async (req, res) => {
  try {
    const totalUsers = await usersCollection.countDocuments();

    // সব ডাটা একসাথে ক্যালকুলেট করা
    const stats = await promptCollection.aggregate([
      {
        $group: {
          _id: null,
          totalPrompts: { $sum: 1 },
          totalCopies: { $sum: { $ifNull: ["$copyCount", 0] } },
          totalReviews: { $sum: { $size: { $ifNull: ["$reviews", []] } } }
        }
      }
    ]).toArray();

    // দিন অনুযায়ী ডাটা (Daily Chart Data)
    const dailyData = await promptCollection.aggregate([
      {
        $group: {
          _id: { 
            $dateToString: { format: "%Y-%m-%d", date: { $toDate: "$createdAt" } } 
          },
          copies: { $sum: { $ifNull: ["$copyCount", 0] } },
          reviews: { $sum: { $size: { $ifNull: ["$reviews", []] } } }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]).toArray();

    const data = stats.length > 0 ? stats[0] : { totalPrompts: 0, totalCopies: 0, totalReviews: 0 };

    // খেয়াল করো, এখানে dailyData অবজেক্টটি পাঠিয়ে দিচ্ছি
    res.send({
      totalUsers,
      totalPrompts: data.totalPrompts,
      totalCopies: data.totalCopies,
      totalReviews: data.totalReviews,
      dailyData: dailyData // এই লাইনটি মাস্ট!
    });
  } catch (error) {
    res.status(500).send({ message: "Error" });
  }
});


// সব ইউজারদের দেখার জন্য
app.get("/api/admin/users", async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.send(users);
});

// রোল আপডেট করার জন্য
app.patch("/api/admin/update-role/:id", async (req, res) => {
  const id = req.params.id;
  const { role } = req.body;
  const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { role } });
  res.send(result);
});

// ইউজার ডিলিট করার জন্য
app.delete("/api/admin/delete-user/:id", async (req, res) => {
  const id = req.params.id;
  const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});// সব ইউজারদের দেখার জন্য
app.get("/api/admin/users", async (req, res) => {
  const users = await usersCollection.find().toArray();
  res.send(users);
});

// রোল আপডেট করার জন্য
app.patch("/api/admin/update-role/:id", async (req, res) => {
  const id = req.params.id;
  const { role } = req.body;
  const result = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { role } });
  res.send(result);
});

// ইউজার ডিলিট করার জন্য
app.delete("/api/admin/delete-user/:id", async (req, res) => {
  const id = req.params.id;
  const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});






// সব পেমেন্ট রেকর্ড দেখার জন্য (Admin)
app.get("/api/admin/payments", async (req, res) => {
  try {
    // তোমার কালেকশনের নাম যদি premium_records হয়
    const payments = await premiumRecordsCollection.find().sort({ purchaseDate: -1 }).toArray();
    res.send(payments);
  } catch (error) {
    res.status(500).send({ message: "Error fetching payments" });
  }
});


// report 

app.patch("/api/admin/reports/:reportId", async (req, res) => {
  const { action, promptId } = req.body;
  const reportId = req.params.reportId;

  try {
    if (action === 'remove') {
      // প্রম্পট কালেকশন থেকে প্রম্পটটি ডিলিট করা
      await promptCollection.deleteOne({ _id: new ObjectId(promptId) });
    }
    
    // রিপোর্টটি 'resolved' করা বা ডিলিট করে দেওয়া
    await reportCollection.deleteOne({ _id: new ObjectId(reportId) });
    
    res.send({ success: true, message: "Action performed successfully" });
  } catch (error) {
    res.status(500).send({ message: "Internal Server Erroor" });
  }
});







// প্রম্পট স্ট্যাটাস এবং ফিচার আপডেট (Admin)
app.patch("/api/admin/update-prompt/:id", async (req, res) => {
  const id = req.params.id;
  const { status, rejectionFeedback, isFeatured } = req.body;
  
  const updateDoc = { $set: {} };
  if (status) updateDoc.$set.status = status;
  if (rejectionFeedback !== undefined) updateDoc.$set.rejectionFeedback = rejectionFeedback;
  if (isFeatured !== undefined) updateDoc.$set.isFeatured = isFeatured;

  const result = await promptCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
  res.send(result);
});

// সব প্রম্পট দেখার জন্য (Admin)
app.get("/api/admin/prompts", async (req, res) => {
  const prompts = await promptCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(prompts);
});
// প্রম্পট ডিলিট করার জন্য (Admin)
app.delete("/api/admin/delete-prompt/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const query = { _id: new ObjectId(id) };
    const result = await promptCollection.deleteOne(query);
    
    if (result.deletedCount === 1) {
      res.send({ success: true, message: "Prompt deleted successfully!" });
    } else {
      res.status(404).send({ success: false, message: "Prompt not found" });
    }
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});





















    // My Bookmarks API

  app.get("/api/bookmarks/my-bookmarks", async (req, res) => {
  try {
    const userId = req.query.userId;
    
    // বুকমার্ক এবং প্রম্পট কালেকশন জয়েন করা
    const bookmarks = await bookmarkCollection.aggregate([
      { $match: { userId: userId } },
      {
        $addFields: {
          promptObjId: { $toObjectId: "$promptId" } // string ID কে ObjectId তে রূপান্তর
        }
      },
      {
        $lookup: {
          from: "prompts", // তোমার প্রম্পট কালেকশনের নাম
          localField: "promptObjId",
          foreignField: "_id",
          as: "promptDetails"
        }
      },
      { $unwind: "$promptDetails" }
    ]).toArray();

    res.send(bookmarks);
  } catch (error) {
    res.status(500).send({ message: "Error fetching bookmarks" });
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




    // ... আগের কোডগুলো যেমন আছে তেমনই থাকবে

// primium user collection 
app.patch("/api/users/upgrade-to-premium", async (req, res) => {
  try {
    const { email, name, image } = req.body; 

    // ডাটাবেজের 'user' কালেকশনে এই ইমেইলটি খুঁজবে
    const userResult = await usersCollection.updateOne(
      { email: email }, 
      { $set: { plan: "premium" } }
    );

    // টার্মিনালে চেক করার জন্য
    console.log("Email searched:", email);
    console.log("Matched Count:", userResult.matchedCount);

    if (userResult.matchedCount === 0) {
      // যদি 0 হয়, তার মানে ডাটাবেজে এই ইমেইলটা নেই
      return res.status(404).send({ success: false, message: "User not found!" });
    }

    // প্রিমিয়াম রেকর্ড এন্ট্রি
    await premiumRecordsCollection.insertOne({
      email, 
      name, 
      image, 
      purchaseDate: new Date()
    });

    res.send({ success: true, message: "Congrats! You are now a premium user." });
  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).send({ success: false, message: "Server error" });
  }
});

// ... এর পরের কোডগুলো (যেমন: Dashboard Stats API) আগের মতোই থাকবে
    


// User Dashboard Stats API
app.get("/api/users/stats/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const userEmail = req.query.email;

    // ১. কার্ডের জন্য ডাটা কুয়েরি
    const myPrompts = await promptCollection.countDocuments({ userId });
    const savedPrompts = await bookmarkCollection.countDocuments({ userId });

    const copyResult = await promptCollection.aggregate([
      { $match: { userId } },
      { $group: { _id: null, total: { $sum: "$copyCount" } } }
    ]).toArray();
    const totalCopies = copyResult.length > 0 ? copyResult[0].total : 0;

    const reviewsGiven = await promptCollection.countDocuments({ "reviews.email": userEmail });

    const ratingResult = await promptCollection.aggregate([
      { $match: { userId } },
      { $group: { _id: null, avgRating: { $avg: "$rating" } } }
    ]).toArray();
    const avgRating = ratingResult.length > 0 ? ratingResult[0].avgRating : 0;

    // ২. গ্রাফের জন্য রিয়েল ডাটা কুয়েরি
    const activityData = await promptCollection.aggregate([
      { $match: { userId: userId } },
      { 
        $group: { 
          _id: { $month: "$createdAt" }, 
          totalCopies: { $sum: "$copyCount" } 
        } 
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    // গ্রাফের জন্য ডাটা ফরম্যাট করা
    const formattedData = activityData.map(item => ({
      name: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][item._id - 1],
      TotalCopies: item.totalCopies
    }));

    // ৩. সব ডাটা একসাথে পাঠানো
    res.send({
      myPrompts,
      savedPrompts,
      totalCopies,
      reviewsGiven,
      avgRating: avgRating.toFixed(1), // ফিক্সড রেটিং
      activityData: formattedData
    });
  } catch (error) {
    console.error("Stats Error:", error);
    res.status(500).send({ message: "Error fetching stats" });
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

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!",
    // );
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running smoothly on port ${port}`);
});
