const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

async function main() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('mern-pos');
  const user = await db.collection('users').findOne({ email: 'cashier@pos.com' });
  
  if (!user) {
    console.log('User not found');
  } else {
    console.log('Found user:', user.email);
    console.log('Hash length:', user.passwordHash?.length);
    const isMatch = await bcrypt.compare('password123', user.passwordHash);
    console.log('Matches password123:', isMatch);
    
    // reset to password123
    const newHash = await bcrypt.hash('password123', 10);
    await db.collection('users').updateOne(
      { email: 'cashier@pos.com' },
      { $set: { passwordHash: newHash } }
    );
    console.log('Reset password successfully');
  }
  
  await client.close();
}

main().catch(console.error);
