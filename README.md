# Round-Robin Coupon Distribution System

## 📌 Overview

This project is a **backend system** for generating, storing, and distributing unique coupon codes using a **round-robin** method. The system ensures fairness by restricting users from requesting multiple coupons within a **specific time window (1 hour)**.

## 🚀 Tech Stack

- **Backend:** Node.js + Express.js
- **Database:** MongoDB (without Mongoose)
- **Middleware:** cors, dotenv, cookie-parser

## 🛠 Features

✅ Unique coupon generation in the format `RRC-XXXXXX`\
✅ Round-robin distribution of coupons\
✅ Prevents users from claiming multiple coupons in a short period\
✅ Uses **cookies & IP tracking** for claim restrictions\
✅ Auto-generates a new batch of coupons when exhausted

---

## 📦 Installation & Setup

### 1️⃣ Prerequisites

- Install **Node.js (v16+)**
- Setup **MongoDB** (Local or Cloud)

### 2️⃣ Clone the repository

```sh
git clone https://github.com/sikderfahad/round-robin-coupon-server
cd round-robin-coupon
```

### 3️⃣ Install dependencies

```sh
yarn
```

### 4️⃣ Configure environment variables

Create a `.env` file and add the following:

```env
PORT=3000 / 5000
MONGO_URI=your_mongodb_connection_string
```

### 5️⃣ Start the server

```sh
nodemon start
```

**Server will run on:** `http://localhost:3000` / `http://localhost:5000`

---

## 🔥 API Endpoints

### ✅ **Health Check**

- **GET /**\
  _Response:_ `Coupon server is running...`

### 🎟 **Request a Coupon**

- **GET /get-coupon**
- **Success Response:**

```json
{
  "success": true,
  "coupon": "RRC-123456"
}
```

- **Cooldown Restriction Response:**

```json
{
  "msg": "Server restriction: Please wait 59 minutes before requesting another coupon."
}
```

---

## 📊 Workflow Diagram

```
User Request ➜ Check IP & Cookies ➜ If Eligible ➜ Assign Coupon ➜ Store Request Time ➜ Prevent Multiple Requests
```

### 🌟 Workflow Steps

1. User requests a coupon (`/get-coupon`).
2. Server **checks IP & cookies** to verify eligibility.
3. If eligible, fetch the **next available coupon**.
4. Coupon is **moved** from `new-coupons` to `old-coupons`.
5. If no coupons are available, **generate a new batch**.
6. Response is sent to the user, and request time is logged in **cookies**.

---

## 📂 Database Schema

- **`new-coupons`**\*\* collection:\*\*

```json
{
  "_id": "ObjectId",
  "coupons": ["RRC-123456", "RRC-987654"]
}
```

- **`old-coupons`**\*\* collection:\*\*

```json
{
  "_id": "ObjectId",
  "coupons": ["RRC-654321", "RRC-112233"]
}
```

---
