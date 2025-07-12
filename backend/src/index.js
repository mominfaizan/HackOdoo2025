const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
console.log("Env Path:", path.resolve(__dirname, "../.env"));
const temp_JWT =
  "9554422f901ac728c06891dbbd77e4fba1a3c03a11df3a07bbced09ee02eb616";
console.log("JWT_SECRET:", temp_JWT);

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
    const decoded = jwt.verify(token, temp_JWT);
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
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Check if user exists first
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ error: "Email already in use" });
    }

    // Create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    });

    // Verify JWT_SECRET is available
    if (!temp_JWT) {
      throw new Error("JWT_SECRET missing");
    }

    // Generate token
    const token = jwt.sign({ userId: user.id }, temp_JWT, {
      expiresIn: "1h",
    });

    return res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    console.error("Signup Error:", err);
    return res.status(500).json({
      error: "Registration failed",
      details: err.message,
    });
  }
});
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user with password field
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, password: true },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Password comparison
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Verify JWT_SECRET
    if (!temp_JWT) {
      throw new Error("JWT_SECRET missing");
    }

    // Generate token
    const token = jwt.sign({ userId: user.id }, temp_JWT, {
      expiresIn: "1h",
    });

    return res.json({
      success: true,
      token,
      user: { id: user.id },
    });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({
      error: "Login failed",
      details: err.message,
    });
  }
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

app.post("/posts/:id/vote", authenticate, async (req, res) => {
  try {
    const { upvote } = req.body;
    const postId = parseInt(req.params.id);
    const userId = req.user.id;

    // Validate input
    if (typeof upvote !== "boolean") {
      return res.status(400).json({ error: "Upvote must be a boolean" });
    }

    // Check if post exists
    const postExists = await prisma.post.findUnique({
      where: { id: postId },
    });
    if (!postExists) {
      return res.status(404).json({ error: "Post not found" });
    }

    // Upsert vote
    const vote = await prisma.vote.upsert({
      where: {
        userId_postId: {
          // This matches the @@unique name in schema
          userId,
          postId,
        },
      },
      update: { upvote },
      create: {
        upvote,
        userId,
        postId,
      },
    });

    // Get updated vote count
    const voteCount = await prisma.vote.count({
      where: {
        postId,
        upvote: true,
      },
    });

    res.json({
      success: true,
      vote,
      voteCount,
    });
  } catch (err) {
    console.error("Voting error:", err);
    res.status(500).json({
      error: "Voting failed",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
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
