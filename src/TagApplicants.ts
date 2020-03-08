import { functions, cors, db, VerifyAuth } from "./util";
import { firestore } from "firebase-admin";

const collection = "hacker_info_2020";
const BatchLimit = 500;

/**
 * This function takes in a list of applicants and two lists of tags. One for tags to remove and the other for tags to add.
 * These tags are then added onto the applicants and committed to firebase.
 */
export default functions.https.onRequest((request, response) =>
  cors(request, response, async () => {
    if (request.method !== "POST") {
      return response.status(400).send("Unrecognized method"); // database error
    }

    //Authentication
    const clientToken = request.header("Authorization");
    if (clientToken === undefined) return response.sendStatus(400);
    if (!VerifyAuth(clientToken)) {
      return response.sendStatus(403);
    }

    const data = request.body;
    const { applicants, tagsToAdd, tagsToRemove } = data;

    // Verify Data
    if (!tagsToAdd || tagsToAdd.constructor !== Array) {
      return response
        .status(400)
        .send("tagsToAdd field is missing/not an array");
    }
    if (!tagsToRemove || tagsToRemove.constructor !== Array) {
      return response
        .status(400)
        .send("tagsToRemove field is missing/not an array");
    }
    if (!applicants || applicants.constructor !== Array) {
      return response
        .status(400)
        .send("applicants field is missing/not an array");
    }

    // Get applicant docs
    const applicantDocs = ((await Promise.all(
      applicants.map(async (id: string) => {
        return db
          .collection(collection)
          .doc(id)
          .get();
      })
    )) as unknown) as [firestore.DocumentSnapshot];

    // Create a batch (a group of firebase updates)
    let batch = db.batch();
    const batchCommitPromises = [];

    applicantDocs.forEach((applicantDoc, index) => {
      //Get applicant data
      const applicant = applicantDoc.data();

      // Get tags and add/remove tags
      let { tags } = applicant as any;
      if (typeof tags !== "object") {
        tags = {};
      }

      tagsToAdd.forEach((tagToAdd: string) => {
        tags[tagToAdd] = true;
      });

      tagsToRemove.forEach((tagToRemove: string) => {
        delete tags[tagToRemove];
      });

      // Update this applicant with the new tags
      const { ref } = applicantDoc;
      batch.set(ref, { tags }, { mergeFields: ["tags"] });

      // every 500 docs commit the batch and start a new one
      if (index % BatchLimit === BatchLimit - 1) {
        batchCommitPromises.push(batch.commit()); // commit current batch
        batch = db.batch(); // create new batch
      }
    });

    batchCommitPromises.push(batch.commit()); // commit the remaining docs in the batch
    try {
      await Promise.all(batchCommitPromises);
      return response.status(200).send();
    } catch (e) {
      return response.status(500).send(e);
    }
  })
);
