const express = require('express');
const app = express();
const cors = require('cors');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');

app.use(cors());
app.use(bodyParser.json());

const serviceAccount = require('./firebase-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://kglrideapp-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

app.get('/driver-exists', async (req, res) => {
  const { phone } = req.query;
  const snapshot = await db.ref("drivers/" + phone).once('value');
  if (snapshot.exists()) {
    const driver = snapshot.val();
    res.send({
      firstName: driver.firstName,
      lastName: driver.lastName,
      plate_number: driver.plate
    });
  } else {
    res.status(404).send({ exists: false });
  }
});

// POST /register-driver
app.post('/register-driver', async (req, res) => {
  const { phone, firstName, lastName, plate } = req.body;
  if (!phone || !plate) {
    return res.status(400).send({ message: 'Missing phone or plate' });
  }

  let driver_membership="active";

  await db.ref("drivers/" + phone).set({
    firstName,
    lastName,
    phone,
    plate,
    driver_membership,
    registeredAt: Date.now()
  });

  res.send({ success: true });
});

// POST /create-ride
app.post('/create-ride', async (req, res) => {
  const id = Date.now().toString();
  const ride = { ...req.body, id, accepted: false };
  await db.ref("ride_requests/" + id).set(ride);
  res.send({ success: true });
});

// GET /nearby-rides
app.get('/nearby-rides', async (req, res) => {
  const { lat, lng } = req.query;
  const snapshot = await db.ref("ride_requests").once('value');
  const nearby = [];

  snapshot.forEach(child => {
    const ride = child.val();
    if (!ride.accepted) {
      const distance = getDistanceKm(
        parseFloat(lat), parseFloat(lng),
        ride.departureLat, ride.departureLng
      );
      if (distance <= 0.5) {
        nearby.push(ride);
      }
    }
  });

  res.json(nearby);
});

// POST /accept-ride
app.post('/accept-ride', async (req, res) => {
  const { rideId, driverId } = req.body;
  const ref = db.ref("ride_requests/" + rideId);
  const snapshot = await ref.once('value');
  const ride = snapshot.val();

  if (ride && !ride.accepted) {
    ride.accepted = true;
    ride.acceptedBy = driverId;
    await ref.set(ride);
    res.send({ phone: ride.phone });
  } else {
    res.status(400).send({ message: "Ride already accepted" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
