import { Router, Response, Request, NextFunction } from "express";
import cors from "cors";
import {config} from "dotenv"
import Queue, { DoneCallback, Job } from "bull";
import  redis from "ioredis"
import axios from "axios"

config();

export const router = Router();

const envs = process.env

if ( envs.REDIS_HOST !== undefined)
    throw new Error("REDIS_HOST is undefined!")
if ( envs.REDIS_PORT === undefined)
    throw new Error("REDIS_PORT is undefined!")
if ( envs.AI_NODE === undefined)
    throw new Error("AI_NODE is undefined!")
if ( envs.ORIGIN_URL === undefined)
    throw new Error("ORIGIN_URL is undefined!")


const redisConfig = {
    host: envs.REDIS_HOST || "localhost",
    port: parseInt(envs.REDIS_PORT) || 6379,
}

const jobQueue = Queue('jobQueue3', { redis: redisConfig })
const processingTimes = Queue('processingTime', { redis: redisConfig })

let AverageProcessingTime = 2.15 * 60 * 1000;
const updateFrequency = 1;
// setInterval(function() {
//     updateAverageProcessingTime()
// }, minutes * 60 * 1000);


function updateAverageProcessingTime(){
        const client = new redis(redisConfig);

    
        client.on('connect', () => {
            console.log('Connected to Redis');
        });
    
        client.on('error', (err) => {
            console.error('Redis Client Error:', err);
        });
    
        // Get jobs from the last hour
        client.lrange(`bull:processingTime`, '-3600', '+', (err, jobs) => {
            if (err || jobs == undefined) {
                console.error('Error retrieving jobs:', err);
            }
            else if (jobs.length == 0){
                // ?????
            } else {
                let totalSum = 0;
                let count = 0;
        
                for (let i = 0; i < jobs.length; i++) {
                const jobData = JSON.parse(jobs[i]);               
                totalSum += jobData.data.proccessingTime;;
                count++;
                }
        
                if (count > 0) {
                    const averageValue = totalSum / count;
                    AverageProcessingTime = totalSum / count
                    console.log('Average value over last minute: ' + AverageProcessingTime);
                }
            }
        });
        client.disconnect(true);
}

function getAiNode(){
    //TODO: Round robin a list of nodes

    return envs.AI_NODE
}

jobQueue.process( async (job: Job, done: DoneCallback) => {
    const data = job.data
    const startTime = Date.now()
    // const update = job.data.startTime = startTime;

    await axios.post(getAiNode() + "/generate", {
        data: { package: job.data.package }
    }).then( result => {
        job.data.feedback = result.data.Feedback
        const feedback = job.data
        job.update(feedback)
        done()
    }).catch( error => {
        console.log(error);
        done(new Error("Unable to generate feedback"))
    })
})

router.use(
    cors({ origin: envs.ORIGIN_URL}));

router.use(function(req: Request, res: Response, next: NextFunction) {
    res.header("Access-Control-Allow-Orgin", envs.ORIGIN_URL)
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
    
    if ('OPTIONS' === req.method) {
        res.sendStatus(200);
      }
      else {
        next();
      }
})

router.post("/queue", async (req: Request, res: Response) => {
    const job = jobQueue.add({package: req.body.data.package, token: "ADD TOKENS"})

    job.then( id => {
        console.log( "Job added. ID: " + id.id )
        res.status(200).json( {jobID: id.id})
    }).catch( err => {
         res.sendStatus(500)
    })
});

router.post("/status/:id", async (req: Request, res: Response) => {
    const id = req.params.id
    const job = await jobQueue.getJob(id);

    if ( job === null ){
        console.log("Job null??")
        res.status(500)
        return;
    }

    job.getState().then( status =>{
        if ( status == "completed"){
            console.log("Final Data Thing: " + JSON.stringify(job.data))
            res.status(200).send({status: "completed", data: job.data.feedback })
        }else{
            const timeRemaining = Date.now() - job.data.startTime;
            console.log( job.data.startTime)
            console.log("Time remaining: " + timeRemaining)
            res.status(200).send({status: status, timeRemaining: timeRemaining})
        }
    })
});
