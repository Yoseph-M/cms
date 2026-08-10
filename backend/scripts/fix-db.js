import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.DATABASE_URL;

async function cleanUp() {
  if (!uri) {
    console.error("No DATABASE_URL found in .env");
    return;
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();

    console.log("Connected to database. Running cleanup for Prisma strict type compatibility...");

    // 1. MenuItems
    const menuItemsRes = await db.collection('menuitems').updateMany(
      { $or: [{ name: null }, { name: { $exists: false } }] },
      { $set: { name: "Unnamed Item", category: "FOOD", price: 0, isAvailable: false } }
    );
    console.log(`- Fixed ${menuItemsRes.modifiedCount} documents in 'menuitems'`);

    // 2. Users
    const usersRes = await db.collection('users').updateMany(
      { $or: [{ name: null }, { name: { $exists: false } }] },
      { $set: { name: "Unnamed User", role: "WAITER", phone: "0000000000", salaryAmount: 0 } }
    );
    console.log(`- Fixed ${usersRes.modifiedCount} documents in 'users'`);

    // 3. Attendance
    const attendanceRes = await db.collection('attendance').updateMany(
      { $or: [{ date: null }, { date: { $exists: false } }] },
      { $set: { date: new Date().toISOString().split('T')[0], status: "PRESENT" } }
    );
    console.log(`- Fixed ${attendanceRes.modifiedCount} documents in 'attendance'`);

    // 4. Find a valid User to use as a fallback for broken foreign keys
    const fallbackUser = await db.collection('users').findOne({});
    if (fallbackUser) {
      // 5. UserPayments
      const upRes = await db.collection('user_payments').updateMany(
        { $or: [
          { processedById: null }, 
          { processedById: { $exists: false } },
          { userId: null }, 
          { userId: { $exists: false } }
        ]},
        { $set: { processedById: fallbackUser._id, userId: fallbackUser._id } }
      );
      console.log(`- Fixed ${upRes.modifiedCount} documents with missing IDs in 'user_payments'`);
      
      // Fetch all valid user IDs to find orphaned records
      const allUsers = await db.collection('users').find({}, { projection: { _id: 1 } }).toArray();
      const userIds = allUsers.map(u => u._id);

      // Fix orphaned processedById
      const upOrphanProcessedRes = await db.collection('user_payments').updateMany(
        { processedById: { $nin: userIds } },
        { $set: { processedById: fallbackUser._id } }
      );
      console.log(`- Fixed ${upOrphanProcessedRes.modifiedCount} orphaned processedById in 'user_payments'`);

      // Fix orphaned userId
      const upOrphanUserRes = await db.collection('user_payments').updateMany(
        { userId: { $nin: userIds } },
        { $set: { userId: fallbackUser._id } }
      );
      console.log(`- Fixed ${upOrphanUserRes.modifiedCount} orphaned userId in 'user_payments'`);

      // 6. Login Attempts
      const loginAttemptsRes = await db.collection('login_attempts').updateMany(
        { userId: { $nin: userIds } },
        { $set: { userId: fallbackUser._id } }
      );
      console.log(`- Fixed ${loginAttemptsRes.modifiedCount} orphaned login_attempts`);

      // 7. Orders
      const orderMissingRes = await db.collection('orders').updateMany(
        { $or: [
          { waiterId: null }, 
          { waiterId: { $exists: false } }
        ]},
        { $set: { waiterId: fallbackUser._id } }
      );
      console.log(`- Fixed ${orderMissingRes.modifiedCount} orders with missing waiterId`);

      const orderOrphanRes = await db.collection('orders').updateMany(
        { waiterId: { $nin: userIds } },
        { $set: { waiterId: fallbackUser._id } }
      );
      console.log(`- Fixed ${orderOrphanRes.modifiedCount} orphaned waiterId in 'orders'`);

    } else {
       console.log("No users found to use as fallback for foreign keys.");
    }

    console.log("\nCleanup complete! Try refreshing your page now.");
  } catch (e) {
    console.error("Error during cleanup:", e);
  } finally {
    await client.close();
  }
}

cleanUp();
