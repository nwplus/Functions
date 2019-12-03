import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin'
import * as corsModule from "cors";
const cors = corsModule({origin: true})
//import * as Parser from 'json2csv'
admin.initializeApp()
const Mailchimp = require('mailchimp-api-v3');
const API_KEY: string = functions.config().mailchimp.key
const adminPass = functions.config().cms.pass
const mailchimp = new Mailchimp(API_KEY)
// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
export const subscribeToMailingList = functions.https.onRequest(async (request, response) => {
    return cors(request, response, async () => {
        if (request.body.email_address === '') {
            response.sendStatus(400)
            return
        }
        const mailigListId = '711520562b'
        console.log(`Using mailing list id: ${mailigListId}`)
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
export const updateAdminsOnAdd = functions.firestore.document('admins/*').onCreate(async (change, context) => {
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
