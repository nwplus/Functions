import { tagApplicants } from "./tagApplicants.js";
import ApplicantToCSV from "./ApplicantToCsv";
import emailConfirmation from "./emailConfirmation";
import newAdmin from "./newAdmin";
import subscribeToMailingList from "./subscribeMailingList";

/**
 * Export all of our functions so firebase can deploy them
 */
export {
  ApplicantToCSV,
  emailConfirmation,
  newAdmin,
  tagApplicants,
  subscribeToMailingList
};
