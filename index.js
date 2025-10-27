const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Load environment variables from .env file
dotenv.config();

const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
  })
);
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ebn1vec.mongodb.net/parcelDB?appName=Cluster0`;

console.log(uri);
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    console.log("MongoDB connection are successfully");
    const db = client.db("parcelDB"); // database name
    const parcelCollection = db.collection("parcels");
    const paymentsCollection = db.collection("payments");

    // app.get('/parcels', async (req, res) => {
    //     const parcels = await parcelCollection.find().toArray();
    //     res.send(parcels);
    // });

    // parcels api
    // GET: All parcels OR parcels by user (created_by), sorted by latest
    // app.get('/parcels', async (req, res) => {
    //     try {
    //         const userEmail = req?.query?.email;
    //         console.log("User email from query:", userEmail);
    //         const query = userEmail ? { created_by: userEmail } : {};
    //         const options = {
    //             sort: { creation_date: -1 }, // Newest first
    //         };

    //         const parcels = await parcelCollection.find(query, options).toArray();
    //         res.send(parcels);
    //     } catch (error) {
    //         console.error('Error fetching parcels:', error);
    //         res.status(500).send({ message: 'Failed to get parcels' });
    //     }
    // });
    // app.get('/parcels', async (req, res) => {
    //     try {
    //       const userEmail = req.query.email;
    //       console.log("User email from query:", userEmail);

    //       let query = {};
    //       if (userEmail) {
    //         query = { created_by: userEmail };
    //       }

    //       console.log("MongoDB Query:", query);

    //       const parcels = await parcelCollection
    //         .find(query)
    //         .sort({ creation_date: -1 }) // ✅ must use sort separately
    //         .toArray();

    //       res.send(parcels);
    //     } catch (error) {
    //       console.error("Error fetching parcels:", error);
    //       res.status(500).send({ message: "Failed to get parcels" });
    //     }
    //   });

    // POST: Create a new parcel

    app.get("/parcels", async (req, res) => {
      try {
        const userEmail = req.query.email;
        //   console.log("User email from query:", userEmail);

        let query = {};
        if (userEmail) {
          query = { created_by: userEmail }; // ✅ filter by email
        }

        const parcels = await parcelCollection
          .find(query)
          .sort({ creation_date: -1 }) // ✅ correct sorting
          .toArray();

        res.send(parcels);
      } catch (error) {
        console.error("Error fetching parcels:", error);
        res.status(500).send({ message: "Failed to get parcels" });
      }
    });

    app.post("/parcels", async (req, res) => {
      try {
        const newParcel = req.body;
        // newParcel.createdAt = new Date();
        const result = await parcelCollection.insertOne(newParcel);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error inserting parcel:", error);
        res.status(500).send({ message: "Failed to create parcel" });
      }
    });

    // parcel single get api
    app.get("/parcels/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await parcelCollection.findOne(query);
        if (!result) {
          return res.status(404).send({ message: "Parcel not found" });
        }
        res.status(200).send(result);
      } catch (error) {
        console.log("Parcel get is error", error);
        res.status(500).send({ message: "Server error", error: error.message });
      }
    });

    app.delete("/parcels/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelCollection.deleteOne(query);
      res.send(result);
    });
    // Payments Api

    app.get("/payments", async (req, res) => {
      try {
        const userEmail = req.query.email;

        const query = userEmail ? { email: userEmail } : {};
        const options = { sort: { paid_at: -1 } }; // Latest first

        const payments = await paymentsCollection
          .find(query, options)
          .toArray();
        res.send(payments);
      } catch (error) {
        console.error("Error fetching payment history:", error);
        res.status(500).send({ message: "Failed to get payments" });
      }
    });

    app.post("/payments", async (req, res) => {
      try {
        const { parcelId, email, amount, paymentMethod, transactionId } =
          req.body;
        const queryId = { _id: new ObjectId(parcelId) };
        const updateResult = await parcelCollection.updateOne(queryId, {
          $set: {
            payment_status: "paid",
          },
        });
        if (updateResult.modifiedCount === 0) {
          return res
            .status(404)
            .send({ message: "Parcel not found or already paid" });
        }
        const paymentDoc = {
          parcelId,
          email,
          amount,
          paymentMethod,
          transactionId,
          paid_at_string: new Date().toISOString(),
          paidAt: new Date(),
        };
        const paymentResult = await paymentsCollection.insertOne(paymentDoc);
        res.status(201).send({
          message: "Payment recorded and parcel marked as paid",
          insertedId: paymentResult.insertedId,
        });
      } catch (error) {
        console.error("Payment processing failed: ", error);
        res.status(500).send({ message: "Failed to recorded payments" });
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      const { amountInCents } = req.body;
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInCents,
          currency: "usd",
          automatic_payment_methods: {
            enabled: true,
          },
        });

        res.json({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // app.delete('/parcels/:id', async (req, res) => {
    //     try {
    //         const id = req.params.id;

    //         const result = await parcelCollection.deleteOne({ _id: new ObjectId(id) });

    //         res.send(result);
    //     } catch (error) {
    //         console.error('Error deleting parcel:', error);
    //         res.status(500).send({ message: 'Failed to delete parcel' });
    //     }
    // });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Sample route
app.get("/", (req, res) => {
  res.send("Parcel Server is running");
});

// Start the server
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
