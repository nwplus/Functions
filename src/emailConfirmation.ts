import { admin, functions } from "./util.js";
import { Change } from "firebase-functions";
import { DocumentSnapshot } from "@google-cloud/firestore";

import * as nodemailer from "nodemailer";
import Mail = require("nodemailer/lib/mailer");

const adminPass = functions.config().cms.pass;
const applicantUpdateUrl = functions.config().slack.applicant;

const db = admin.firestore();

/**
 * Handles applicant deletion in the email collection
 * @param change
 * @returns Null
 */
const handleApplicantDeletion = async (change: Change<DocumentSnapshot>) => {
  const oldData = change.before.data();
  if (oldData) {
    console.log(`Deleting applicant: ${oldData.id}`);
    return db
      .collection("hacker_email_2020")
      .doc(oldData.email)
      .delete();
  } else {
    return Promise.reject();
  }
};

/**
 * Removes a users old email document and adds a new one with the new users email.
 * @param before
 * @param after
 * @param change
 * @returns Promise<null>
 */
const emailUpdate = async (
  before: any,
  after: any,
  change: Change<DocumentSnapshot>
) => {
  const { email: beforeEmail } = before;
  const { email: afterEmail } = after;
  if (beforeEmail !== afterEmail) {
    await change.after.ref.parent.doc(afterEmail).set(after);
    await change.after.ref.delete();
    console.log(`Email ${beforeEmail} sucessfully moved to ${afterEmail}`);
  } else {
    console.log("Applicant already tracked/emailed.");
  }
};

/**
 * Send an email confirmation to a new hacker
 * @param email
 */

const Email = async (email: String) => {
  console.log(`Attempting to email ${email}`);

  // Create the mail transporter
  const transporter = nodemailer.createTransport({
    host: "smtp.zoho.com",
    port: 465,
    secure: true, // use SSL
    auth: {
      user: "logistics@nwplus.io",
      pass: adminPass
    }
  });

  //Set up the email to send
  const mailOptions = {
    from: "logistics@nwplus.io",
    to: email,
    subject: "Thank you for registering for nwHacks 2020!",
    html:
      '<html><body><img src="cid:email_confirm" alt="nwHacks confirmation"/></body></html>',
    attachments: [
      {
        filename: "Email_confirmation_banner.png",
        path: "./Email_confirmation_banner.png",
        cid: "email_confirm" //same cid value as in the html img src
      }
    ]
  };

  //Send the email and handle errors
  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions as Mail.Options, function(error, info) {
      if (error) {
        console.log(error);
        reject();
      } else {
        console.log(`Email sent to: ${email} with response ${info.response}`);
        resolve();
      }
    });
  });
};

/**
 * Handles Slack updates and applicant number tracking.
 */

const numberTracker = async () => {
  const length = (await db.collection("hacker_email_2020").get()).size;
  const dataCollection = db.collection("application_data").doc("nwHacks");
  let dataDoc = await dataCollection.get();
  if (!dataDoc.exists) {
    console.log("creating data doc");
    await dataCollection.create({
      size: 0,
      lastSize: 0
    });
  }
  await dataCollection.update({
    size: length
  });
  dataDoc = await dataCollection.get();
  const data = dataDoc.data();
  if (!data) {
    return;
  }
  console.log(
    `last milestone was: ${data.lastSize} current size is: ${length}`
  );
  if (length % 50 === 0) {
    console.log("Logging new milestone...");
    await dataCollection.update({
      lastSize: length,
      [`milestones.${length}`]: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("Messaging slack!");
    const { IncomingWebhook } = require("@slack/webhook");
    const url = applicantUpdateUrl;
    const webhook = new IncomingWebhook(url);
    await webhook.send({
      text: `🎉🎉 There are now ${length} applicants for nwHacks!!! 🎉🎉`
    });
  }
};

export default functions.firestore
  .document("hacker_info_2020/{hackerID}")
  .onWrite(async change => {
    // Handle applicant deletion
    if (!change.after.exists && change.before.exists) {
      handleApplicantDeletion(change).catch(e => {
        console.log("Error deleting applicant.");
        console.log(e);
      });
    }
    // Handle applicant updates
    if (change.before.exists) {
      await emailUpdate(
        change.before.data() as any,
        change.after.data() as any,
        change
      );
      // await updateScored()
      return true;
    }
    const data = change.after.data() as any;
    await Email(data.email);
    await numberTracker();
    await change.after.ref.update({
      id: data.email,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log("Applicant setup!");
    return true;
  });
