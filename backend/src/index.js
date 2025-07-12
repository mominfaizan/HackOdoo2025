require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Auth Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.userId };
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};
app.get("/", (req, res) => {
  res.json({ message: "StackIt API is running" });
});

// Auth Routes
app.post("/auth/signup", async (req, res) => {
  const { email, password, name } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  } catch (err) {
    res.status(400).json({ error: "User already exists" });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
  res.json({ token });
});

// Posts Routes
app.get("/posts", async (req, res) => {
  const questions = await prisma.post.findMany({
    where: { isQuestion: true },
    include: {
      author: { select: { name: true } },
      tags: true,
      _count: { select: { answers: true, votes: true } },
    },
  });
  res.json(questions);
});

app.post("/posts", authenticate, async (req, res) => {
  const { title, content, isQuestion, tags, parentId } = req.body;

  const post = await prisma.post.create({
    data: {
      title,
      content,
      isQuestion,
      authorId: req.user.id,
      parentId,
      tags: {
        connectOrCreate: tags.map((tag) => ({
          where: { name: tag },
          create: { name: tag },
        })),
      },
    },
  });
  res.json(post);
});

// Voting
app.post("/posts/:id/vote", authenticate, async (req, res) => {
  const { upvote } = req.body;
  const postId = parseInt(req.params.id);

  await prisma.vote.upsert({
    where: { userId_postId: { userId: req.user.id, postId } },
    update: { upvote },
    create: { upvote, userId: req.user.id, postId },
  });

  res.json({ success: true });
});

// Tags
app.get("/tags", async (req, res) => {
  const tags = await prisma.tag.findMany();
  res.json(tags);
});

app.get("/tags/:tag/posts", async (req, res) => {
  const posts = await prisma.post.findMany({
    where: {
      isQuestion: true,
      tags: { some: { name: req.params.tag } },
    },
    include: { author: true, tags: true },
  });
  res.json(posts);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
