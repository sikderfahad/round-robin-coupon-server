import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { MongoClient, ServerApiVersion } from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// ✅ Middleware setup
app.use(cors({ origin: ["http://localhost:5173"], credentials: true })); // Allow frontend requests with credentials
app.use(express.json()); // Parse JSON request bodies
app.use(cookieParser()); // Enable cookie handling

// ✅ MongoDB Connection
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ✅ Selecting the database and collections
const db = client.db("couponDB");
const newCouponCollection = db.collection("new-coupons"); // Stores unused coupons
const oldCouponCollection = db.collection("old-coupons"); // Stores claimed coupons

// ✅ Store for tracking user claims based on IP & Cookies
const claimRecords = new Map();

// ✅ Function to generate a unique random coupon code
const generateUniqueCoupon = async () => {
  let couponCode;
  let exists;

  do {
    const randomNumber = Math.floor(100000 + Math.random() * 900000); // Generates a 6-digit random number
    couponCode = `RRC-${randomNumber}`; // Prefixing coupon with "RRC-"

    // Check if the generated coupon already exists
    const existInNewCoupons = await newCouponCollection.findOne({
      coupons: couponCode,
    });
    const existInOldCoupons = await oldCouponCollection.findOne({
      coupons: couponCode,
    });

    exists = existInNewCoupons || existInOldCoupons;
    console.log("exist: ", exists);
  } while (exists); // Repeat until a unique coupon is generated

  return couponCode;
};

// ✅ Generate multiple unique coupons and store them in an array
const makeNewCouponsArray = async (couponNumber) => {
  let couponBox = [];
  for (let i = 0; i < couponNumber; i++) {
    const newCoupon = await generateUniqueCoupon();
    couponBox.push(newCoupon);
  }
  return couponBox;
};

// ✅ Get a single coupon from the database (First available)
const getSingleCoupon = async () => {
  try {
    const result = await newCouponCollection
      .aggregate([
        { $match: { coupons: { $exists: true, $ne: [] } } }, // Find a document that contains coupons
        { $project: { firstCoupon: { $arrayElemAt: ["$coupons", 0] } } }, // Select the first coupon from the array
        { $limit: 1 },
      ])
      .toArray();

    return result?.length > 0 ? result[0].firstCoupon : null;
  } catch (error) {
    console.log(error);
  }
};

// ✅ Format the remaining cooldown time before requesting a new coupon
const formateRemainingTime = (timeStamp) => {
  const totalSeconds = Math.ceil(timeStamp / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds} second${totalSeconds !== 1 ? "s" : ""}`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} minute${minutes !== 1 ? "s" : ""} and ${seconds} second${
    seconds !== 1 ? "s" : ""
  }`;
};

// ✅ Default Route - Check if server is running
app.get("/", (req, res) => {
  res.send("Coupon server is running ...");
});

// ✅ Endpoint to request a coupon
app.get("/get-coupon", async (req, res) => {
  const userIp = req.ip; // Get user's IP address
  const now = Date.now();
  const oneHour = 60 * 60 * 1000; // Cooldown period: 1 hour
  const lastRequestTime = req.cookies?.lastRequestTime;
  const storedIp = req.cookies?.userIp;

  // 🚨 Check if user is making a request within the restricted time frame
  if (
    userIp === storedIp &&
    lastRequestTime &&
    now - lastRequestTime < oneHour
  ) {
    const timeRemaining = oneHour - (now - parseInt(lastRequestTime, 10));
    if (timeRemaining > 0) {
      return res.status(429).json({
        msg: `Server restriction: Please wait ${formateRemainingTime(
          timeRemaining
        )} before requesting another coupon.`,
      });
    }
  }

  try {
    // ✅ Function to move a coupon from "new-coupons" to "old-coupons" after it's claimed
    const removeAndUpdateCoupon = async (coupon) => {
      try {
        // ✅ Add the coupon to the "old-coupons" collection
        const addCouponInOldBox = await oldCouponCollection.updateOne(
          {},
          { $addToSet: { coupons: coupon } }, // Ensure no duplicates
          { upsert: true }
        );

        if (
          !addCouponInOldBox.upsertedCount &&
          !addCouponInOldBox.modifiedCount &&
          !addCouponInOldBox.matchedCount
        ) {
          return false;
        }

        // ✅ Remove the coupon from "new-coupons" collection
        const removeCouponFromNewBox = await newCouponCollection.updateOne(
          {},
          { $pull: { coupons: coupon } }
        );

        // ✅ If no more coupons left in the document, remove it
        const newCouponDoc = await newCouponCollection.findOne({});
        if (!newCouponDoc || newCouponDoc.coupons.length === 0) {
          await newCouponCollection.deleteOne({ _id: newCouponDoc._id });
        }

        return removeCouponFromNewBox?.modifiedCount > 0;
      } catch (error) {
        console.log(error);
        return false;
      }
    };

    let coupon = await getSingleCoupon();

    // 🚨 If no available coupons, generate a new batch
    if (!coupon) {
      const newCouponBox = await makeNewCouponsArray(100);
      if (
        !newCouponBox ||
        !Array.isArray(newCouponBox) ||
        newCouponBox.length === 0
      ) {
        return res.status(500).json({ msg: "Failed to generate new coupons" });
      }

      const addNewCouponBoxRes = await newCouponCollection.insertOne({
        coupons: newCouponBox,
      });
      if (!addNewCouponBoxRes.insertedId) {
        return res.status(500).json({ msg: "Failed to add new coupon batch" });
      }

      coupon = await getSingleCoupon();
      if (!coupon) {
        return res.status(500).json({ msg: "Failed to get a new coupon" });
      }
    }

    // ✅ Move the coupon from new to old collection
    const updateOldAndNewCouponBox = await removeAndUpdateCoupon(coupon);
    if (!updateOldAndNewCouponBox) {
      return res.status(500).json({ msg: "Failed to update coupon database" });
    }

    // ✅ Set cookies to track user's request time and IP
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: oneHour,
    };

    res.cookie("userIp", userIp, cookieOptions);
    res.cookie("lastRequestTime", now, cookieOptions);
    res.status(200).send({ success: true, coupon });
  } catch (error) {
    console.log("Server error: ", error);
    return res.status(500).json({ msg: "Server error", error });
  }
});

// ✅ Function to start the server and verify MongoDB connection
const startServer = async () => {
  await client.db("admin").command({ ping: 1 });
  console.log("Pinged your deployment. Successfully connected to MongoDB!");

  // 🚀 Uncomment this for local development; remove in production
  // app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
};

startServer();
export default app;
