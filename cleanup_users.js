const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function deleteGuestAccounts() {
  console.log("🔍 Scanning for guest accounts...");
  let nextPageToken;
  let totalDeleted = 0;

  try {
    do {
      const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
      
      // Guest accounts have no email and no provider (Google/Email/etc.)
      const guestUsers = listUsersResult.users.filter(user => 
        user.providerData.length === 0 && !user.email
      );

      if (guestUsers.length > 0) {
        const uids = guestUsers.map(user => user.uid);
        await admin.auth().deleteUsers(uids);
        totalDeleted += uids.length;
        console.log(`🗑️ Deleted ${uids.length} guest accounts...`);
      }
      
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    console.log(`✅ Success! Total guest accounts removed: ${totalDeleted}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error deleting accounts:", error);
    process.exit(1);
  }
}

deleteGuestAccounts();
