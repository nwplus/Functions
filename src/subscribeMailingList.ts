import { functions, cors } from "./util.js";
const Mailchimp = require("mailchimp-api-v3");
const API_KEY: string = functions.config().mailchimp.key;
const mailchimp = new Mailchimp(API_KEY);

// Id of the mailing list to add people to
const MailingListId = "711520562b";

/**
 * Description:
 *  Subscribes an email to the nwPlus mailing list.
 * Method: POST
 * Body params:
 *  - email_address: String(email)
 * Returns:
 *  - 200 on success
 *  - 500/400 on failure
 * Side effects:
 *  - Subscribes the email provided in the body to the nwPlus waiting list.
 * Possible errors:
 *  - Incorrect email
 *  - No email
 *  - Wrong method
 *  - Fake email
 */

export default functions.https.onRequest((request, response) =>
  cors(request, response, async () => {
    if (request.method !== "POST") {
      response.sendStatus(500);
      return;
    }

    if (request.body.email_address === "") {
      response.sendStatus(400);
      return;
    }

    console.log(`Using mailing list id: ${MailingListId}`);
    console.log(`attempting to subscribe: ${request.body.email_address}`);

    try {
      const reply = await mailchimp.post(`lists/${MailingListId}/`, {
        members: [
          {
            email_address: request.body.email_address,
            status: "subscribed"
          }
        ]
      });

      // Check for errors
      if (reply.error_count > 0) {
        console.log("Mailchimp errors");
        const error: String = reply.errors[0].error;
        if (error.indexOf("already a list member") !== -1) {
          response
            .status(502)
            .send({ errors: "This email has already signed up" });
          return;
        } else if (
          error.indexOf("looks fake or invalid") !== -1 ||
          error.indexOf("valid email address") !== -1
        ) {
          response.status(502).send({ errors: error });
          return;
        } else {
          console.log(reply.errors);
          response.status(502).send({ errors: "Unexpected Mailchimp error" });
          return;
        }
      }
      // Success
      console.log(`Successfully subscribed: ${request.body.email_address}`);
      response.sendStatus(200);
      return;
    } catch (e) {
      console.log("Server error");
      console.log(e);
      response.sendStatus(500);
      return;
    }
  })
);
