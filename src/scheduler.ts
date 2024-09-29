import { Router, Response, Request, NextFunction } from "express";
import cors from "cors";
import { config } from "dotenv";
import Queue, { DoneCallback, Job } from "bull";
import redis from "ioredis";
import axios from "axios";
import { v4 as uuidV4 } from "uuid";

config();

export const router = Router();

const envs = process.env;

if (envs.REDIS_HOST === undefined) throw new Error("REDIS_HOST is undefined!");
if (envs.REDIS_PORT === undefined) throw new Error("REDIS_PORT is undefined!");
if (envs.AI_NODE === undefined) throw new Error("AI_NODE is undefined!");
if (envs.ORIGIN_URL === undefined) throw new Error("ORIGIN_URL is undefined!");
if (process.env.AI_NODES === undefined)
  throw new Error("AI_NODES is undefined!");

const redisConfig = {
  host: envs.REDIS_HOST || "localhost",
  port: parseInt(envs.REDIS_PORT) || 6379,
  defaultJobOptions: {
    attempts: 30,
    backoff: {
      type: "fixed",
      delay: "10000",
    },
  },
  removeOnFailure: true,
};

const jobQueue = Queue("jobQueue4", { redis: redisConfig });
const processingTimes = Queue("processingTime", { redis: redisConfig });

const nodes = () => {
  const nodeList = process.env.AI_NODES;
  if (nodeList === undefined) return ["undefined"];
  if (nodeList.indexOf(",") > -1)
    return nodeList.replaceAll(" ", "").split(",");
  else return [nodeList];
};

let AverageProcessingTime = 2.15 * 60 * 1000;
const updateFrequency = 1;
// setInterval(function() {
//     updateAverageProcessingTime()
// }, minutes * 60 * 1000);

function updateAverageProcessingTime() {
  const client = new redis(redisConfig);

  client.on("connect", () => {
    console.log("Connected to Redis");
  });

  client.on("error", (err) => {
    console.error("Redis Client Error:", err);
  });

  // Get jobs from the last hour
  client.lrange(`bull:processingTime`, "-3600", "+", (err, jobs) => {
    if (err || jobs == undefined) {
      console.error("Error retrieving jobs:", err);
    } else if (jobs.length == 0) {
      // ?????
    } else {
      let totalSum = 0;
      let count = 0;

      for (let i = 0; i < jobs.length; i++) {
        const jobData = JSON.parse(jobs[i]);
        totalSum += jobData.data.proccessingTime;
        count++;
      }

      if (count > 0) {
        const averageValue = totalSum / count;
        AverageProcessingTime = totalSum / count;
        console.log("Average value over last minute: " + AverageProcessingTime);
      }
    }
  });
  client.disconnect(true);
}

async function getAiNode() {
  //TODO: Round robin a list of nodes
  for (let i = 0; i < nodes().length; i++) {
    const node = nodes()[i];
    const result = await axios
      .get(node + "/status", {})
      .then((result) => {
        if (result.data.status === true) {
          console.log("Node [" + node + "] willing to accept jobs");
          return true;
        } else return false;
      })
      .catch((error) => {
        console.log(error);
        return false;
      });
    if (result) return node;
  }
}

jobQueue.process(async (job: Job, done: DoneCallback) => {
  const data = job.data;
  const startTime = Date.now();
  console.log("Job data: " + job.data.status);

  if (job.data.status == "Removed") {
    done();
    return;
  }
  // const update = job.data.startTime = startTime;
  await getAiNode().then(async (node) => {
    await axios
      .post(node + "/generate", {
        data: { package: job.data.package },
      })
      .then((result) => {
        if (result.data.error !== undefined) {
          console.log("Problem with server: " + result.data.error);
        } else {
          job.data.feedback = result.data.Feedback;
          const feedback = job.data;
          job.update(feedback);
          done();
        }
      })
      .catch((error) => {
        console.log(error);
        done(new Error("Unable to generate feedback"));
      });
  });
});

router.use(cors({ origin: process.env.ORIGIN_URL }));

router.use(function (req: Request, res: Response, next: NextFunction) {
  res.header("Access-Control-Allow-Orgin", process.env.ORIGIN_URL);
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );

  if ("OPTIONS" === req.method) {
    res.sendStatus(200);
  } else {
    next();
  }
});

router.post("/queue", async (req: Request, res: Response) => {
  if (req.body.data.current_job !== null) {
    console.log("Canceling existing job [" + req.body.data.current_job + "]");
    jobQueue.getJob(req.body.data.current_job).then((job) => {
      job?.update({ status: "Removed" });
    });
  }

  const job = jobQueue.add(
    { package: req.body.data.package, token: "ADD TOKENS" },
    { jobId: uuidV4() }
  );

  job
    .then((id) => {
      console.log("Job added. ID: " + id.id);
      res.status(200).json({ jobID: id.id });
    })
    .catch((err) => {
      res.sendStatus(500);
    });
});

router.post("/status/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  const job = await jobQueue.getJob(id);

  if (job === null) {
    console.log("Job null??");
    res.status(500);
    return;
  }

  job.getState().then((status) => {
    if (status == "completed") {
      console.log("Final Data Thing: " + JSON.stringify(job.data));
      job.remove();
      res.status(200).send({ status: "completed", data: job.data.feedback });
    } else {
      const timeRemaining = Date.now() - job.data.startTime;
      console.log(job.data.startTime);
      console.log("Time remaining: " + timeRemaining);
      res.status(200).send({ status: status, timeRemaining: timeRemaining });
    }
  });
});
