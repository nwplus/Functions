import * as Parser from "json2csv";
import { functions, VerifyAuth, cors, db } from "./util";

/**
 * Returns a csv with all hacker info
 * Requires Authentication
 */
export default functions.https.onRequest(async (request, response) =>
  cors(request, response, async () => {
    //Auth
    const authHeader = request.get("Authorization");
    if (authHeader === undefined) return;
    if (!VerifyAuth(authHeader)) {
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
