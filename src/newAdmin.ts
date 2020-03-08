import { admin, functions, cors, adminPass, db } from "./util.js";

/**
 * Adds a new user to the admin collection and gives them proper admin permissions.
 * @param uid
 */
const addNewAdmin = async (uid: string) => {
  const admins = db.collection("admins");
  await admins.doc(uid).set({
    name: (await admin.auth().getUser(uid)).displayName,
    generatedby: "login portal",
    email: (await admin.auth().getUser(uid)).email
  });
  await admin.auth().setCustomUserClaims(uid, { admin: true });
};

/**
 * Checks to make sure the correct password is provided and if it is, creates a new admin with these details.
 */
export default functions.https.onRequest(async (request, response) =>
  cors(request, response, async () => {
    const uid = request.body.uid;
    const pass = request.body.pass;
    console.log(`used pass: ${pass}`);
    if (!pass || pass !== adminPass) {
      response.sendStatus(500);
    } else {
      await addNewAdmin(uid);
      response.sendStatus(200);
    }
  })
);
