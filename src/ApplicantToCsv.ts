import * as Parser from "json2csv";
import { functions, admin, cors } from "./util";

const db = admin.firestore();

/**
 * Checks the authentication of a header.
 * @param header
 */
const checkAuth = async (header: string) => {
  const idToken = header.split("Bearer ")[1];
  const uid = (await admin.auth().verifyIdToken(idToken)).uid;
  const ref = db.collection("admins");
  const admins = (await ref.get()).docs;
  return admins.find(doc => {
    return doc.id === uid;
  });
};

export default functions.https.onRequest(async (request, response) =>
  cors(request, response, async () => {
    //Auth
    const authHeader = request.get("Authorization");
    if (authHeader === undefined) return;
    if (!checkAuth(authHeader)) {
      response.sendStatus(403);
      return;
    }
    //Export
    const hackerReference = db.collection("hacker_info_2020");
    const snapshot = await hackerReference.get();
    const hackerInfo = snapshot.docs.map(doc => doc.data());
    const parser = new Parser.Parser();
    const csv = parser.parse(hackerInfo);
    response.attachment("Hackers.csv");
    response.status(200).send(csv);
  })
);
