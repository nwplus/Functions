import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin'
import * as corsModule from "cors";
import * as nodemailer from 'nodemailer'
import Mail = require('nodemailer/lib/mailer');
const cors = corsModule({origin: true})
import * as Parser from 'json2csv'
admin.initializeApp()
const Mailchimp = require('mailchimp-api-v3');
const API_KEY: string = functions.config().mailchimp.key
const adminPass = functions.config().cms.pass
const applicantUpdateUrl = functions.config().slack.applicant
const mailchimp = new Mailchimp(API_KEY)
// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
const backFill = async () => {
    const db = admin.firestore()
    const hackers = await db.collection('hacker_info_2020').get()
    await Promise.all(hackers.docs.map(doc => {
        return doc.ref.update({
            id: doc.data().email
        })
    }))
}

const numberTracker = async () => {
    const db = admin.firestore()
    const length = (await db.collection('hacker_email_2020').get()).size
    const dataCollection = db.collection('application_data').doc('nwHacks')
    let dataDoc = await dataCollection.get()
    if (!(dataDoc.exists)){
        console.log('creating data doc')
        await dataCollection.create({
            size: 0,
            lastSize: 0
        })
    }
    await dataCollection.update({
        size: length
    })
    dataDoc = await dataCollection.get()
    const data = dataDoc.data()
    if (!data){ return }
    console.log(`last milestone was: ${data.lastSize} current size is: ${length}`)
    if (length % 50 === 0){
        console.log('Logging new milestone...')
        await dataCollection.update({
            lastSize: length,
            [`milestones.${length}`]: admin.firestore.FieldValue.serverTimestamp()
        })  
        console.log('Messaging slack!')
        const { IncomingWebhook } = require('@slack/webhook');
        const url = applicantUpdateUrl;
        const webhook = new IncomingWebhook(url);
        await webhook.send({
            text: `🎉🎉 There are now ${length} applicants for nwHacks!!! 🎉🎉`,
          });
    }
}
const Email = async (email: String) => {
    console.log(`Attempting to email ${email}`)
    const transporter = nodemailer.createTransport({
        host: 'smtp.zoho.com',
        port: 465,
        secure: true, // use SSL
        auth: {
            user: 'logistics@nwplus.io',
            pass: adminPass
        }
    });
    const mailOptions = {
        from: 'logistics@nwplus.io',
        to: email,
        subject: 'Thank you for registering for nwHacks 2020!',
        html: 
        '<html><body><img src="cid:email_confirm" alt="nwHacks confirmation"/></body></html>',
        attachments: [{
            filename: 'Email_confirmation_banner.png',
            path: './Email_confirmation_banner.png',
            cid: 'email_confirm' //same cid value as in the html img src
        }]
    };
    return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions as Mail.Options, function(error, info){
            if (error) {
              console.log(error);
              reject()
            } else {
              console.log(`Email sent to: ${email} with response ${info.response}`);
              resolve()
            }
          });
    })
}

export const emailConfirmation = functions.firestore.document('hacker_info_2020/{hackerID}').onWrite(async (change, context) => {
    // delete mail doc if document is deleted.
    const db = admin.firestore()
    if (!change.after.exists && change.before.exists) {
        const oldData = change.before.data()
        if (oldData){
            console.log(`Deleting applicant: ${oldData.email}`)
            return db.collection('hacker_email_2020').doc(oldData.email).delete()
        }
    }
    if (change.before.exists) {
        console.log('Applicant already tracked/emailed.')
        return
    }
    const data = change.after.data()
    if ( data === undefined) return
    await Email(data.email)
    await numberTracker()
    await change.after.ref.update({
        id: data.email,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    })
    console.log('Applicant setup!')
    return true;
})

export const subscribeToMailingList = functions.https.onRequest(async (request, response) => {
    return cors(request, response, async () => {
        if (request.body.email_address === '') {
            response.sendStatus(400)
            return
        }
        const mailigListId = '711520562b'
        console.log(`Using mailing list id: ${mailigListId}`)
        console.log(`attempting to subscribe: ${request.body.email_address}`)
        try {
            const reply = await mailchimp.post(`lists/${mailigListId}/`, {
                members: [
                    {
                        "email_address": request.body.email_address,
                        "status": 'subscribed'
                    },
                ]})
            if (reply.error_count > 0){
                console.log("Mailchimp errors")
                const error: String = reply.errors[0].error
                if (error.indexOf('already a list member') !== -1) {
                    response.status(502).send({errors: 'This email has already signed up'})
                    return
                }else if ((error.indexOf('looks fake or invalid') !== -1)||
                        (error.indexOf('valid email address') !== -1)) {
                    response.status(502).send({errors: error})
                    return
                }else {
                    console.log(reply.errors)
                    response.status(502).send({errors: 'Unexpected Mailchimp error'})
                    return
                }
            }else {
                console.log(`Successfully subscribed: ${request.body.email_address}`)
                response.sendStatus(200)
                return
            }

        }catch (e){
            console.log("Server error")
            console.log(e)
            response.sendStatus(500)
            return
        }
    })
});


export const getAdminTokens = functions.https.onRequest( async (request, response) => {
    const db = admin.firestore()
    const admins = await db.collection('admins').get()
    const adminIDs = admins.docs.map((doc) => doc.id)
    await Promise.all(adminIDs.map(async (id) => {
        const user = await admin.auth().getUser(id)
        console.log(`Claims for ${user.email}`)
        console.log(user.customClaims)
    }))
})

const updateAdminIDs = async (): Promise<Number> => {
    const db = admin.firestore()
    const admins = await db.collection('admins').get()
    const adminIDs = admins.docs.map((doc) => doc.id)
    console.log(adminIDs.length)
    await Promise.all(adminIDs.map(async (id) => {
            await admin.auth().setCustomUserClaims(id, {admin: true})
            console.log(`admin set for: ${ (await admin.auth().getUser(id)).email}`)
        }))
    return(adminIDs.length)
}
export const updateAdmins = functions.https.onRequest( async (request, response) => {
    const amount = await updateAdminIDs()
    console.log(`updated ${amount} admins`)
    response.sendStatus(200)
})
export const updateAdminsOnAdd = functions.firestore.document('admins/{adminID}').onCreate(async (change, context) => {
    const data = change.data()
    console.log(`New admin added: ${data !== undefined ? data.email : ''}`)
    const amount = await updateAdminIDs()
    console.log(`updated ${amount} admins`)
    return
})

export const newAdmin = functions.https.onRequest( async (request, response) => {
    return cors(request, response, async () => {
        const uid = request.body.uid
        const pass = request.body.pass
        console.log(`used pass: ${pass}`)
        if (!pass || pass !== adminPass) {
            response.sendStatus(500)
        }else {
            const db = admin.firestore()
            const admins = await db.collection('admins')
            await admins.doc(uid).set({
                name: ( await admin.auth().getUser(uid)).displayName,
                generatedby: 'login portal',
                email: ( await admin.auth().getUser(uid)).email
            })
            response.sendStatus(200)
        }
    })
})

export const backFillIds = functions.https.onRequest( async (request, response) => {
    return cors(request, response, async () => {
        await backFill()
        response.send(200)
    })
})

export const ApplicantToCSV = functions.https.onRequest( async (request, response) => {
    return cors(request, response, async () => {
        //Auth
        const authHeader = request.get('Authorization')
        if (authHeader === undefined) return
        const idToken = authHeader.split('Bearer ')[1];
        const uid = (await admin.auth().verifyIdToken(idToken)).uid
        const db = admin.firestore()
        const ref = db.collection('admins')
        const admins = (await ref.get()).docs
        if (!admins.reduce((acc, doc) => {
            if (acc) return acc
            if (doc.id === uid){
                return true
            }
            return false
        }, false)) return
        //Export
        const hackerReference = db.collection('hacker_info_2020')
        const snapshot = await hackerReference.get()
        const hackerInfo = snapshot.docs.map((doc) => doc.data())
        const parser = new Parser.Parser();
        const csv = parser.parse(hackerInfo);
        response.attachment('Hackers.csv')
        response.status(200).send(csv)
    })
})
