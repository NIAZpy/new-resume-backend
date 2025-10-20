require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const pdf = require('pdf-parse');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Multer setup for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Database Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected successfully.'))
  .catch(err => console.error('MongoDB connection error:', err));

// Mongoose Schemas & Models
const recruiterProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  companyName: String,
  companyWebsite: String,
  industry: String,
  companySize: String,
  companyAddress: String,
  country: String,
  recruiterFullName: String,
  jobTitle: String,
  recruiterEmail: String,
  recruiterPhone: String,
  linkedInProfile: String,
  rolesRecruitedFor: [String],
  preferredLocations: [String],
  hiringVolume: String,
  recruitmentModel: String,
});

const User = require('./models/User');
const RecruiterProfile = mongoose.model('RecruiterProfile', recruiterProfileSchema);

const resumeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  personalInfo: Object,
  summary: String,
  experience: Array,
  education: Array,
  skills: Array,
  projects: Array,
  links: Array,
  awards: Array,
  template: { type: String, default: 'classic' },
}, { timestamps: true });

const Resume = mongoose.model('Resume', resumeSchema);

const jobSchema = new mongoose.Schema({
  recruiter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  jobTitle: { type: String, required: true },
  department: { type: String },
  reportsTo: { type: String },
  location: { type: String, required: true },
  employmentType: { type: String, enum: ['Full-time', 'Part-time', 'Contract', 'Internship'], required: true },
  jobSummary: { type: String, required: true },
  keyResponsibilities: [String],
  requiredQualifications: [String],
  preferredQualifications: [String],
  coreCompetencies: [String],
  workEnvironment: { type: String },
  compensationAndBenefits: { type: String },
  applicationInstructions: { type: String },
  companyName: { type: String, required: true },
}, { timestamps: true });

const Job = mongoose.model('Job', jobSchema);

const applicationSchema = new mongoose.Schema({
  job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  candidate: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  resume: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true },
  status: { type: String, enum: ['Submitted', 'Viewed', 'Rejected', 'Interviewing'], default: 'Submitted' },
}, { timestamps: true });

const Application = mongoose.model('Application', applicationSchema);

// Routes
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Registration Route
app.post('/register', async (req, res) => {
  const { username, password, role, ...profileData } = req.body;
  try {
    let user = await User.findOne({ username });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    user = new User({ username, password, role });

    if (role === 'Recruiter') {
      const recruiterProfile = new RecruiterProfile({
        user: user._id,
        ...profileData,
      });
      await recruiterProfile.save();
      user.recruiterProfile = recruiterProfile._id;
    }

    await user.save();
    res.status(201).send({ message: 'User registered successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Login Route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const payload = { user: { id: user.id, role: user.role } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Middleware to verify token
const auth = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// Role-based access control middleware
const isCandidate = (req, res, next) => {
  if (req.user.role !== 'Candidate') {
    return res.status(403).json({ msg: 'Only candidates can perform this action.' });
  }
  next();
};

const isAdmin = (req, res, next) => {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({ msg: 'Admin access denied' });
  }
  next();
};

const isRecruiter = (req, res, next) => {
  if (req.user.role !== 'Recruiter') {
    return res.status(401).json({ msg: 'Only recruiters can access this route' });
  }
  next();
};

// --- Resume Routes ---
app.post('/api/resume', auth, isCandidate, async (req, res) => {
  try {
    const resumeData = { ...req.body, user: req.user.id };
    const updatedResume = await Resume.findOneAndUpdate(
      { user: req.user.id },
      resumeData,
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json({ message: 'Resume saved successfully!', resume: updatedResume });
  } catch (error) {
    console.error('Error saving/updating resume:', error);
    res.status(500).json({ message: 'Failed to save resume.' });
  }
});

app.delete('/api/resume', auth, isCandidate, async (req, res) => {
  try {
    const resume = await Resume.findOne({ user: req.user.id });
    if (!resume) {
      return res.status(404).json({ msg: 'Resume not found' });
    }

    await resume.remove();
    res.json({ msg: 'Resume deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// Get the current user's resume ID
app.get('/api/my-resume-id', auth, isCandidate, async (req, res) => {
  try {
    const resume = await Resume.findOne({ user: req.user.id }).select('_id');
    if (!resume) {
      return res.status(404).json({ msg: 'Resume not found for this user.' });
    }
    res.json({ resumeId: resume._id });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// Get the current user's resume
app.get('/api/my-resume', auth, isCandidate, async (req, res) => {
  try {
    const resume = await Resume.findOne({ user: req.user.id });
    // It's okay if a resume is not found; the frontend will handle it.
    res.json(resume || null);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

app.put('/api/resume/template', auth, isCandidate, async (req, res) => {
  const { template } = req.body;
  try {
    const resume = await Resume.findOne({ user: req.user.id });
    if (!resume) {
      return res.status(404).json({ msg: 'Resume not found' });
    }

    resume.template = template;
    await resume.save();
    res.json({ msg: 'Template updated successfully', resume });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// This route is now used for fetching any resume by its ID, used by the display component
app.get('/api/resume/:id', auth, async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    if (!resume) {
      return res.status(404).json({ msg: 'Resume not found' });
    }
    res.json(resume);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// --- Job Routes ---
app.get('/jobs', auth, isRecruiter, async (req, res) => {
  try {
    const jobs = await Job.find({ recruiter: req.user.id }).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

app.post('/jobs', auth, isRecruiter, async (req, res) => {
  try {
    const newJob = new Job({ ...req.body, recruiter: req.user.id });
    const job = await newJob.save();
    res.status(201).json(job);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

app.delete('/jobs/:id', auth, isRecruiter, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ msg: 'Job not found' });
    }
    if (job.recruiter.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'User not authorized' });
    }
    await Job.deleteOne({ _id: req.params.id });
    await Application.deleteMany({ job: req.params.id });
    res.json({ msg: 'Job removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// --- Public Job Routes ---
app.get('/api/public-jobs', async (req, res) => {
  try {
    const jobs = await Job.find().sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

app.get('/api/public-jobs/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ msg: 'Job not found' });
    }
    res.json(job);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// --- Application Routes ---
app.get('/api/candidate/applications', auth, isCandidate, async (req, res) => {
  try {
    const applications = await Application.find({ candidate: req.user.id })
      .populate('job', 'jobTitle companyName location');
    res.json(applications);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

app.get('/api/jobs/:id/applications', auth, isRecruiter, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ msg: 'Job not found' });
    }
    if (job.recruiter.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'User not authorized' });
    }
    const applications = await Application.find({ job: req.params.id })
      .populate('candidate', 'username')
      .populate('resume');
    res.json(applications);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

app.post('/api/jobs/:id/apply', auth, isCandidate, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ msg: 'Job not found' });
    }
    const resume = await Resume.findOne({ user: req.user.id });
    if (!resume) {
      return res.status(400).json({ msg: 'You must have a saved resume to apply.' });
    }
    const existingApplication = await Application.findOne({ job: req.params.id, candidate: req.user.id });
    if (existingApplication) {
      return res.status(400).json({ msg: 'You have already applied for this job.' });
    }
    const newApplication = new Application({
      job: req.params.id,
      candidate: req.user.id,
      resume: resume._id,
    });
    await newApplication.save();
    res.status(201).json({ msg: 'Application submitted successfully!' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// --- Admin Routes ---
app.get('/api/users', auth, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

app.delete('/api/users/:id', auth, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    if (user.id === req.user.id) {
      return res.status(400).json({ msg: 'You cannot delete your own account.' });
    }
    await user.remove();
    res.json({ msg: 'User removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

app.put('/api/users/:id/role', auth, isAdmin, async (req, res) => {
  const { role } = req.body;
  const { id } = req.params;
  if (!['Candidate', 'Recruiter', 'Admin'].includes(role)) {
    return res.status(400).json({ msg: 'Invalid role specified.' });
  }
  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    if (user.id === req.user.id) {
      return res.status(400).json({ msg: 'You cannot change your own role.' });
    }
    user.role = role;
    await user.save({ validateModifiedOnly: true });
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});