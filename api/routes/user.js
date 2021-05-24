const express = require('express');
const { Mongoose } = require('mongoose');
const User = require('../models/users');
const mongoose = require('mongoose');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const checkAuth = require('../middleware/check-auth');

const _=require("lodash");
const mailgun = require("mailgun-js");
const DOMAIN = 'sandbox411ebfda4f434164b2ee1d22b19687ba.mailgun.org';
const mg = mailgun({apiKey: process.env.MAILGUN_API, domain: DOMAIN});
//import multer for file upload
const multer = require('multer');
const { route } = require('./products');
//some extra changes in file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, new Date().toISOString().replace(/:/g, '-') + file.originalname);
    }
});
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
        cb(null, true);
    }
    else {
        cb(new Error('Only JPEG and PNG file'), false);
    }
}

const upload = multer({
    storage: storage, limits: {
        fileSize: 1024 * 1024 * 5
        //only upto 5MB file size
    },
    fileFilter: fileFilter
});


router.get('/', (req, res, next) => {
    User.find()
        .select("name _id email dept userprofile")
        .exec()
        .then(doc => {
            // which will allow nly specific fields
            const response = {
                count: doc.length,
                Users: doc.map(doc => {
                    return {
                        name: doc.name,
                        email: doc.email,
                        _id: doc._id,
                        userprofile:`http://localhost:3000/${doc.userprofile}`,
                        dept: doc.dept,
                        request: {
                            //can give any type and url whichever we want to execute after clicking on it (metadat)
                            type: 'GET',
                            url: 'http://localhost:3000/user/' + doc._id
                        }
                    }
                })
            };
            // if(doc.length>0){
            res.status(200).json(response);
            // }
            // else{
            //     res.status(404).json({
            //         message:'Empty Products !'
            //     });
            // }
        })
        .catch(err => {
            console.log(err);
            res.status(500).json({ error: err });
        })
});

router.get('/:email',(req,res,next)=>{
    const email=req.params.email;
    User.find({ email: email})
    .select("userprofile")
    .exec()
    .then(doc=>{
        
        const response = {
            Users: doc.map(doc => {
                return {
                    userprofile: doc.userprofile,
                    profile_url:`http://localhost:3000/${doc.userprofile}`
                }
            })
        };
        // if(doc.length>0){
        res.status(200).json(response);
    //}
       // else{
          //  res.status(404).json({message:'Not found !'});
        //}
    }).
    catch(err=>{
        res.status(500).json({error:err});
    });
 });
 
router.post('/signup', upload.single('userprofile'), (req, res, next) => {
        User.find({ email: req.body.email })
        .exec()
        .then(user => {
            if (user.length >= 1) {
                res.status(409).json({
                    message: 'User with this mail alreay exists !'
                });
            }
            else {
                bcrypt.hash(req.body.password, 10, (err, hash) => {
                    if (err) {
                        return res.status.json({
                            error: err
                        });
                    }
                    else {
                        const user = new User({
                            _id: new mongoose.Types.ObjectId(),
                            name: req.body.name,
                            email: req.body.email,
                            password: hash,
                            dept: req.body.dept,
                            userprofile: req.file.path
                        });
                        user
                            .save()
                            .then(result => {
                                console.log(result);
                                res.status(201).json({
                                    message: 'User Registered Successfull !'
                                });
                            })
                            .catch(err => {
                                console.log(err);
                                res.status(500).json({
                                    error: err
                                });
                            });
                    }
                });
            }
        });
});

router.post('/login', (req, res, next) => {
    User.find({ email: req.body.email })
        .exec()
        .then(user => {
            if (user.length < 1) {
                return res.status(401).json({
                    message: 'Authentication Failed'
                });
            }
            bcrypt.compare(req.body.password, user[0].password, (err, result) => {
                if (err) {
                    return res.status(401).json({
                        message: 'Authentication Failed (Wrong Password)'
                    });
                }
                if (result) {
                    const token = jwt.sign({
                        email: user[0].email,
                        userId: user[0]._id
                    },
                        process.env.JWT_KEY,
                        {
                            expiresIn: "1h"
                        });
                        return res.status(200).json({
                        message: 'Sucessfully Logged In!',
                        token: token
                    });
                }
                res.status(401).json({
                    message: 'Auth Failed'
                });
            });
        })
        .catch(err => {
            console.log(err);
            res.status(500).json({
                error: err
            });
        });
});

router.delete('/:userId', (req, res, next) => {
    User.remove({ _id: req.params.userId })
        .exec()
        .then(doc => {
            console.log(doc);
            if (doc) {
                res.status(200).json({
                    message: 'User has been Deleted ! :)'
                });
            }
            else {
                res.status(404).json({
                    message: 'No such User Found !'
                });
            }
        })
        .catch(err => {
            console.log(err);
            res.status(500).json({ error: err });
        });
});

router.put('/forgotPassword',(req, res,next) => {
    const email=req.body.email;
    User.find({ email})
    .exec()
    .then(user => {
        console.log(email);
        if (!(user)) {
            res.status(400).json({
                message: 'User with this mail does not exists !'
            });
        }
        else{
                const token = jwt.sign({userId:user._id},process.env.JWT_KEY_Rest_Link,{ expiresIn: "5h"});
                const data={
                        from:'<noreply@ayka.com>',
                        to: email,
                        subject:'Acount Reset Password Link',
                        html:`
                        <h2>Please click on given link to reset your password</h2>
                        <p>${process.env.CLIENT_URL}/changepassword/${token}</p>`
                      };
                User
                .updateOne({email:email},{resetLink:token},function(err,success){
                        if (err) {
                            res.status(400).json({
                                message: 'Reset Password Link Error !'
                            });
                         }
                        else{
                            mg.messages().send(data, function (error, body) {
                                if(error){
                                     res.status(400).json({
                                      message: error.message
                                      });
                                  }
                                else{
                                    res.status(200).json({message:'Email has been sent,Kindly follow the instruction'});
                                }
                            });
                         }
                    });
                }
         })
        .catch(err => {
            console.log(err);
            res.status(500).json({ error: err });
        }) 
 });
   
 router.put('/changepassword',(req, res,next) => {
    const resetLink=req.body.resetLink;
    const {newPassword}=req.body.newPassword;
    if(resetLink){
        console.log(resetLink);
        console.log(newPassword);
        jwt.verify(resetLink,process.env.JWT_KEY_Rest_Link,function(error,decodedData){
            if(error){
                return res.status(401).json({
                 message: "Incorrect or it is expired."
                 });  
             }
             else{
                User.findOne({resetLink},(err,user)=>{
                     if (!(user)) {
                         res.status(400).json({
                        message: user
                       });
                    }
                    bcrypt.hash(req.body.newPassword, 10, (err, hash) => {
                            if (err) {
                                return res.status(405).json({
                                    error: err.message
                                });
                            }
                            else{
                                    User.updateOne({'resetLink':req.body.resetLink},{'password':hash},function(err,success){
                                           if (err) {
                                            res.status(400).json({
                                                message: 'Reset Password  Error !'
                                            });
                                             return res.status(400).json({message: hash});
                                           }
                                          else{
                                             return res.status(200).json({message:'Your password has been changed'}); 
                                          }
                                    });
                                }
                            });
                    });
               }
         })
     }
    else{
        return res.status(401).json({error:'Authentication Error!!!'});
    }
 });

module.exports = router;