  const express = require("express");
  const session = require("express-session");
  const mysql = require("mysql2");
  const bodyParser = require("body-parser");
  const cors = require("cors");
  const bcrypt = require("bcrypt");
  const router = express.Router();  
  const nodemailer = require('nodemailer');
  require('dotenv').config();
  const cron = require('node-cron'); // For scheduling tasks
  const multer = require("multer");
  const path = require("path");
  const XLSX = require("xlsx");



  // Multer storage configuration
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "uploads/"); // Directory where uploaded files are stored
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
  });

  const upload = multer({ storage });

  const app = express();
  const port = 5000;

  // Middleware
  app.use(
    cors({
      origin: "http://localhost:3000", // Frontend URL
      credentials: true, // Allow credentials (cookies) to be sent
    })
  );
  app.use(bodyParser.json());

  // Configure session
  app.use(
    session({
      secret: "your_secret_key", // Replace with a secure key
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 60000 * 30, // Session expires after 30 minutes
        httpOnly: true,
        secure: false, // Set to true for HTTPS
        sameSite: "lax",
      },
    })
  );

  // MySQL database connection
  const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "mentordb",
  });

  db.connect((err) => {
    if (err) {
      console.error("Database connection failed:", err.message);
    } else {
      console.log("Connected to the database.");
    }
  });

  // Middleware to check if user is authenticated
  const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
      next();
    } else {
      res.status(401).json({ message: "Unauthorized access. Please log in." });
    }
  };
// Login Route for the login page.
  // Login route
  app.post("/login", (req, res) => {
    const { email, password, userType } = req.body;

    let query = "";
    switch (userType) {
      case "Student":
        query = `SELECT Student_id, Name, Email, password FROM student WHERE Email = ? AND password = ?`;
        break;
      case "Faculty":
        query = `SELECT Faculty_id, Name, Email, password FROM faculty WHERE Email = ? AND password = ?`;
        break;
      case "Admin":
        query = `SELECT Admin_id, Name, Email, Password FROM admin WHERE Email = ? AND Password = ?`;
        break;
      default:
        return res.status(400).json({ message: "Invalid user type." });
    }

    db.query(query, [email, password], (err, results) => {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).json({ message: "Database error." });
      }

      if (results.length > 0) {
        const user = results[0];
        delete user.password; // Remove password before saving in the session
        req.session.user = { ...user, userType }; // Save user in the session
        res.status(200).json({ message: "Login successful.", userData: user });
      } else {
        res.status(401).json({ message: "Invalid email or password." });
      }
    });
  });

  // Session check route
  app.get("/check-session", (req, res) => {
    if (req.session && req.session.user) {
      res.status(200).json({ message: "Session valid", user: req.session.user });
    } else {
      res.status(401).json({ message: "Session invalid" });
    }
  });

  // Logout route
  app.post("/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err.message);
        return res.status(500).json({ message: "Logout failed." });
      }
      res.clearCookie("connect.sid", { path: "/" }); // Clear session cookie
      res.status(200).json({ message: "Logout successful." });
    });
  });

// Example protected route
app.get("/dashboard", isAuthenticated, (req, res) => {
  res.status(200).json({
    message: "Welcome to the dashboard.",
    user: req.session.user,
  });
});
///////////////----------------//////////////-------------/////////---------------//
//Add Department page code 

// Route to get all departments
app.get("/departments", async (req, res) => {
  const query = "SELECT * FROM department";
  try {
    const [results] = await db.promise().query(query);  // Using promise-based queries
    res.json(results);
  } catch (err) {
    console.error("Error fetching departments:", err);
    res.status(500).json({ error: "Error fetching departments" });
  }
});


// Route to add a new department
app.post("/departments", (req, res) => {
  const { Dept_name } = req.body;
  const query = "INSERT INTO department (Dept_name) VALUES (?)"; // Remove Dept_id from insert statement

  if (!Dept_name) {
    return res.status(400).json({ error: "Department name is required" });
  }

  db.query(query, [Dept_name], (err, results) => {
    if (err) {
      console.error("Error adding department:", err);
      return res.status(500).json({ error: "Error adding department" });
    }
    res
      .status(201)
      .json({ message: "Department added successfully", id: results.insertId });
  });
});

// Route to update a department
app.put("/departments/:id", (req, res) => {
  const { id } = req.params;
  const { Dept_name } = req.body;
  const query = "UPDATE department SET Dept_name = ? WHERE Dept_id = ?";

  if (!Dept_name) {
    return res.status(400).json({ error: "Department name is required" });
  }

  db.query(query, [Dept_name, id], (err, results) => {
    if (err) {
      console.error("Error updating department:", err);
      return res.status(500).json({ error: "Error updating department" });
    }
    res.json({ message: "Department updated successfully" });
  });
});

app.delete("/departments/:id", (req, res) => {
  const { id } = req.params;

  // Queries to handle dependencies  // delete department
  const deleteMentorCardQuery = `
    DELETE mc
    FROM mentor_card mc
    JOIN student s ON mc.student_id = s.Student_id
    JOIN course c ON s.Course_ID = c.Course_ID
    WHERE c.Dept_ID = ?`;
  const deleteMonitoringSessionQuery = `
    DELETE ms
    FROM monitoring_session ms
    JOIN student s ON ms.student_id = s.Student_id
    JOIN course c ON s.Course_ID = c.Course_ID
    WHERE c.Dept_ID = ?`;
  const deleteAppointmentsQuery = `
    DELETE a
    FROM appointment a
    JOIN student s ON a.Student_id = s.Student_id
    JOIN course c ON s.Course_ID = c.Course_ID
    WHERE c.Dept_ID = ?`;
  const deleteStudentsQuery = `
    DELETE s
    FROM student s
    JOIN course c ON s.Course_ID = c.Course_ID
    WHERE c.Dept_ID = ?`;
  const deleteFacultyQuery = `
    DELETE f
    FROM faculty f
    WHERE f.Dept_ID = ?`;
  const deleteCoursesQuery = `
    DELETE c
    FROM course c
    WHERE c.Dept_ID = ?`;
  const deleteDepartmentQuery = `
    DELETE FROM department WHERE Dept_id = ?`;

  db.beginTransaction((err) => {
    if (err) {
      console.error("Error starting transaction:", err);
      return res.status(500).json({ error: "Transaction failed" });
    }

    // Step 1: Delete mentor cards
    db.query(deleteMentorCardQuery, [id], (err) => {
      if (err) {
        return db.rollback(() => {
          console.error("Error deleting mentor cards:", err);
          res.status(500).json({ error: "Failed to delete mentor cards" });
        });
      }

      // Step 2: Delete monitoring sessions
      db.query(deleteMonitoringSessionQuery, [id], (err) => {
        if (err) {
          return db.rollback(() => {
            console.error("Error deleting monitoring sessions:", err);
            res.status(500).json({ error: "Failed to delete monitoring sessions" });
          });
        }

        // Step 3: Delete appointments
        db.query(deleteAppointmentsQuery, [id], (err) => {
          if (err) {
            return db.rollback(() => {
              console.error("Error deleting appointments:", err);
              res.status(500).json({ error: "Failed to delete appointments" });
            });
          }

          // Step 4: Delete students
          db.query(deleteStudentsQuery, [id], (err) => {
            if (err) {
              return db.rollback(() => {
                console.error("Error deleting students:", err);
                res.status(500).json({ error: "Failed to delete students" });
              });
            }

            // Step 5: Delete faculty
            db.query(deleteFacultyQuery, [id], (err) => {
              if (err) {
                return db.rollback(() => {
                  console.error("Error deleting faculty:", err);
                  res.status(500).json({ error: "Failed to delete faculty" });
                });
              }

              // Step 6: Delete courses
              db.query(deleteCoursesQuery, [id], (err) => {
                if (err) {
                  return db.rollback(() => {
                    console.error("Error deleting courses:", err);
                    res.status(500).json({ error: "Failed to delete courses" });
                  });
                }

                // Step 7: Delete department
                db.query(deleteDepartmentQuery, [id], (err, results) => {
                  if (err) {
                    return db.rollback(() => {
                      console.error("Error deleting department:", err);
                      res.status(500).json({ error: "Failed to delete department" });
                    });
                  }

                  if (results.affectedRows === 0) {
                    return db.rollback(() => {
                      res.status(404).json({ message: "Department not found" });
                    });
                  }

                  // Commit transaction
                  db.commit((err) => {
                    if (err) {
                      return db.rollback(() => {
                        console.error("Error committing transaction:", err);
                        res.status(500).json({ error: "Failed to delete department" });
                      });
                    }
                    res.json({ message: "Department and related data deleted successfully" });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

////////////---------------/////////-------------/////////////--------------///////
// Add new Course page. 
// Get courses with department name
app.get("/courses", (req, res) => {
  const query = `
    SELECT c.Course_ID, c.Course_name, c.Dept_ID, d.Dept_name
    FROM course c
    LEFT JOIN department d ON c.Dept_ID = d.Dept_id
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching courses:", err);
      return res.status(500).json({ error: "Error fetching courses" });
    }
    res.json(results);
  });
});

// Add course
app.post("/courses", (req, res) => {
  const { Course_name, Dept_ID } = req.body;
  const query = "INSERT INTO course (Course_name, Dept_ID) VALUES (?, ?)";
  db.query(query, [Course_name, Dept_ID], (err, result) => {
    if (err) {
      console.error("Error adding course:", err);
      return res.status(500).json({ error: "Error adding course" });
    }
    res.status(201).json({ message: "Course added successfully" });
  });
});

// Update course
app.put("/courses/:id", (req, res) => {
  const { id } = req.params;
  const { Course_name, Dept_ID } = req.body;
  const query =
    "UPDATE course SET Course_name = ?, Dept_ID = ? WHERE Course_ID = ?";
  db.query(query, [Course_name, Dept_ID, id], (err, result) => {
    if (err) {
      console.error("Error updating course:", err);
      return res.status(500).json({ error: "Error updating course" });
    }
    res.json({ message: "Course updated successfully" });
  });
});


// Delete course
app.delete("/courses/:id", (req, res) => {
  const { id } = req.params;

  // Queries to handle dependencies
  const deleteMentorCardQuery = `
    DELETE mc
    FROM mentor_card mc
    JOIN student s ON mc.student_id = s.Student_id
    WHERE s.Course_ID = ?`;
  const deleteMonitoringSessionQuery = `
    DELETE ms
    FROM monitoring_session ms
    JOIN student s ON ms.student_id = s.Student_id
    WHERE s.Course_ID = ?`;
  const deleteAppointmentsQuery = `
    DELETE a
    FROM appointment a
    WHERE a.Student_id IN (SELECT Student_id FROM student WHERE Course_ID = ?)`;
  const deleteStudentsQuery = `
    DELETE FROM student WHERE Course_ID = ?`;
  const deleteCourseQuery = `
    DELETE FROM course WHERE Course_ID = ?`;

  // Start transaction
  db.beginTransaction((err) => {
    if (err) {
      console.error("Error starting transaction:", err);
      return res.status(500).json({ error: "Transaction failed" });
    }

    // Step 1: Delete mentor cards
    db.query(deleteMentorCardQuery, [id], (err) => {
      if (err) {
        return db.rollback(() => {
          console.error("Error deleting mentor cards:", err);
          res.status(500).json({ error: "Failed to delete mentor cards" });
        });
      }

      // Step 2: Delete monitoring sessions
      db.query(deleteMonitoringSessionQuery, [id], (err) => {
        if (err) {
          return db.rollback(() => {
            console.error("Error deleting monitoring sessions:", err);
            res.status(500).json({ error: "Failed to delete monitoring sessions" });
          });
        }

        // Step 3: Delete appointments
        db.query(deleteAppointmentsQuery, [id], (err) => {
          if (err) {
            return db.rollback(() => {
              console.error("Error deleting appointments:", err);
              res.status(500).json({ error: "Failed to delete appointments" });
            });
          }

          // Step 4: Delete students
          db.query(deleteStudentsQuery, [id], (err) => {
            if (err) {
              return db.rollback(() => {
                console.error("Error deleting students:", err);
                res.status(500).json({ error: "Failed to delete students" });
              });
            }

            // Step 5: Delete the course
            db.query(deleteCourseQuery, [id], (err, results) => {
              if (err) {
                return db.rollback(() => {
                  console.error("Error deleting course:", err);
                  res.status(500).json({ error: "Failed to delete course" });
                });
              }

              if (results.affectedRows === 0) {
                return db.rollback(() => {
                  res.status(404).json({ message: "Course not found" });
                });
              }

              // Commit transaction
              db.commit((err) => {
                if (err) {
                  return db.rollback(() => {
                    console.error("Error committing transaction:", err);
                    res.status(500).json({ error: "Failed to delete course" });
                  });
                }
                res.json({ message: "Course and related data deleted successfully" });
              });
            });
          });
        });
      });
    });
  });
});

/////////////--------------//////////----------------//////////---//
// Add faculty page code.
// Get all faculty members
app.get("/faculty", (req, res) => {
  const query =
    "SELECT Faculty_id, Name, Email, password, Dept_ID FROM faculty WHERE 1";
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching faculty:", err);
      return res.status(500).json({ error: "Error fetching faculty" });
    }
    res.json(results);
  });
});

// Add a new faculty member
app.post("/faculty", (req, res) => {
  const { Name, Email, password, Dept_ID } = req.body;
  const query =
    "INSERT INTO faculty (Name, Email, password, Dept_ID) VALUES (?, ?, ?, ?)";
  db.query(query, [Name, Email, password, Dept_ID], (err, result) => {
    if (err) {
      console.error("Error adding faculty:", err);
      return res.status(500).json({ error: "Error adding faculty" });
    }
    res.status(201).json({ message: "Faculty added successfully" });
  });
});

// Update an existing faculty member
app.put("/faculty/:id", (req, res) => {
  const { id } = req.params;
  const { Name, Email, password, Dept_ID } = req.body;
  const query =
    "UPDATE faculty SET Name = ?, Email = ?, password = ?, Dept_ID = ? WHERE Faculty_id = ?";
  db.query(query, [Name, Email, password, Dept_ID, id], (err, result) => {
    if (err) {
      console.error("Error updating faculty:", err);
      return res.status(500).json({ error: "Error updating faculty" });
    }
    res.json({ message: "Faculty updated successfully" });
  });
});

// Delete a faculty member
app.delete("/faculty/:id", (req, res) => {
  const { id } = req.params;

  // Queries to handle dependencies
  const deleteAppointmentsQuery = `
    DELETE FROM appointment WHERE Faculty_id = ?`;
  const updateStudentsQuery = `
    UPDATE student SET Faculty_id = NULL WHERE Faculty_id = ?`;
  const deleteFacultyQuery = `
    DELETE FROM faculty WHERE Faculty_id = ?`;

  // Start transaction
  db.beginTransaction((err) => {
    if (err) {
      console.error("Error starting transaction:", err);
      return res.status(500).json({ error: "Transaction failed" });
    }

    // Step 1: Delete appointments associated with the faculty member
    db.query(deleteAppointmentsQuery, [id], (err) => {
      if (err) {
        return db.rollback(() => {
          console.error("Error deleting appointments:", err);
          res.status(500).json({ error: "Failed to delete appointments" });
        });
      }

      // Step 2: Update students to remove Faculty_id reference
      db.query(updateStudentsQuery, [id], (err) => {
        if (err) {
          return db.rollback(() => {
            console.error("Error updating students:", err);
            res.status(500).json({ error: "Failed to update students" });
          });
        }

        // Step 3: Delete the faculty member
        db.query(deleteFacultyQuery, [id], (err, results) => {
          if (err) {
            return db.rollback(() => {
              console.error("Error deleting faculty:", err);
              res.status(500).json({ error: "Failed to delete faculty" });
            });
          }

          if (results.affectedRows === 0) {
            return db.rollback(() => {
              res.status(404).json({ message: "Faculty member not found" });
            });
          }

          // Commit transaction
          db.commit((err) => {
            if (err) {
              return db.rollback(() => {
                console.error("Error committing transaction:", err);
                res.status(500).json({ error: "Failed to delete faculty" });
              });
            }
            res.json({ message: "Faculty member and related data deleted successfully" });
          });
        });
      });
    });
  });
});


// Route to get all batches
app.get("/batches", (req, res) => {
  const query = "SELECT Batch_id, batch_name FROM batch"; // Adjust your table and column names as needed
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching batches:", err);
      return res.status(500).json({ error: "Error fetching batches" });
    }
    res.json(results);
  });
});

// Route to add a new batch
app.post("/batches", (req, res) => {
  const { batch_name } = req.body;
  const query = "INSERT INTO batch (batch_name) VALUES (?)";

  if (!batch_name) {
    return res.status(400).json({ error: "Batch name is required" });
  }

  db.query(query, [batch_name], (err, results) => {
    if (err) {
      console.error("Error adding batch:", err);
      return res.status(500).json({ error: "Error adding batch" });
    }
    res
      .status(201)
      .json({ message: "Batch added successfully", id: results.insertId });
  });
});

// Route to update a batch
app.put("/batches/:id", (req, res) => {
  const { id } = req.params;
  const { batch_name } = req.body;
  const query = "UPDATE batch SET batch_name = ? WHERE Batch_id = ?";

  if (!batch_name) {
    return res.status(400).json({ error: "Batch name is required" });
  }

  db.query(query, [batch_name, id], (err, results) => {
    if (err) {
      console.error("Error updating batch:", err);
      return res.status(500).json({ error: "Error updating batch" });
    }
    res.json({ message: "Batch updated successfully" });
  });
});

// Route to delete a batch
// Route to delete a batch
app.delete("/batches/:id", (req, res) => {
  const { id } = req.params;

  // Queries to handle dependencies
  const updateStudentsQuery = `
    UPDATE student SET Batch = NULL WHERE Batch = ?`;
  const deleteBatchQuery = `
    DELETE FROM batch WHERE Batch_id = ?`;

  // Start transaction
  db.beginTransaction((err) => {
    if (err) {
      console.error("Error starting transaction:", err);
      return res.status(500).json({ error: "Transaction failed" });
    }

    // Step 1: Update students to remove Batch reference
    db.query(updateStudentsQuery, [id], (err) => {
      if (err) {
        return db.rollback(() => {
          console.error("Error updating students:", err);
          res.status(500).json({ error: "Failed to update students" });
        });
      }

      // Step 2: Delete the batch
      db.query(deleteBatchQuery, [id], (err, results) => {
        if (err) {
          return db.rollback(() => {
            console.error("Error deleting batch:", err);
            res.status(500).json({ error: "Failed to delete batch" });
          });
        }

        if (results.affectedRows === 0) {
          return db.rollback(() => {
            res.status(404).json({ message: "Batch not found" });
          });
        }

        // Commit transaction
        db.commit((err) => {
          if (err) {
            return db.rollback(() => {
              console.error("Error committing transaction:", err);
              res.status(500).json({ error: "Failed to delete batch" });
            });
          }
          res.json({ message: "Batch deleted successfully and students updated" });
        });
      });
    });
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Fetch dropdown data
app.get("/batches", (req, res) => {
  db.query("SELECT Batch_id, batch_name FROM batch", (err, result) => {
    if (err) return res.status(500).send(err);
    res.json(result);
  });
});

app.get("/departments", (req, res) => {
  db.query("SELECT Dept_id, Dept_name FROM department", (err, result) => {
    if (err) return res.status(500).send(err);
    res.json(result);
  });
});

app.get("/courses", (req, res) => {
  db.query("SELECT Course_ID, Course_name, Dept_ID FROM course", (err, result) => {
    if (err) return res.status(500).send(err);
    res.json(result);
  });
});

app.get("/faculty", (req, res) => {
  db.query("SELECT Faculty_id, Name, Dept_ID FROM faculty", (err, result) => {
    if (err) return res.status(500).send(err);
    res.json(result);
  });
});

// Add student
app.post("/students", (req, res) => {
  const { name, rollNo, email, password, address, batch, dept, course, faculty } = req.body;
  const query =
    "INSERT INTO student (Name, Roll_no, Email, password, Address, Batch, Dept_ID, Course_ID, Faculty_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
  db.query(query, [name, rollNo, email, password, address, batch, dept, course, faculty], (err) => {
    if (err) return res.status(500).send(err);
    res.send("Student added successfully");
  });
});

// Fetch all students with detailed information
app.get("/students", (req, res) => {
  const query = `
    SELECT 
      student.Student_id, 
      student.Name, 
      student.Roll_no, 
      student.Email, 
      student.Address, 
      student.Batch AS Batch_id, 
      batch.batch_name AS Batch_name,
      student.Dept_ID, 
      department.Dept_name,
      student.Course_ID, 
      course.Course_name, 
      student.Faculty_id, 
      faculty.Name AS Faculty_name
    FROM student
    LEFT JOIN batch ON student.Batch = batch.Batch_id
    LEFT JOIN department ON student.Dept_ID = department.Dept_id
    LEFT JOIN course ON student.Course_ID = course.Course_ID
    LEFT JOIN faculty ON student.Faculty_id = faculty.Faculty_id
  `;

  db.query(query, (err, result) => {
    if (err) {
      console.error("Error fetching students:", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
    res.status(200).json(result);
  });
});

// Fetch a student by ID with detailed information
app.get("/students/:id", (req, res) => {
  const studentId = req.params.id;
  const query = `
    SELECT 
      student.Student_id, 
      student.Name, 
      student.Roll_no, 
      student.Email, 
      student.Address, 
      student.Batch AS Batch_id, 
      batch.batch_name AS Batch_name,
      student.Dept_ID, 
      department.Dept_name,
      student.Course_ID, 
      course.Course_name, 
      student.Faculty_id, 
      faculty.Name AS Faculty_name
    FROM student
    LEFT JOIN batch ON student.Batch = batch.Batch_id
    LEFT JOIN department ON student.Dept_ID = department.Dept_id
    LEFT JOIN course ON student.Course_ID = course.Course_ID
    LEFT JOIN faculty ON student.Faculty_id = faculty.Faculty_id
    WHERE student.Student_id = ?`;

  db.query(query, [studentId], (err, result) => {
    if (err) {
      console.error("Error fetching student by ID:", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (result.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.status(200).json(result[0]);
  });
});



// Update student data
app.put("/students/:id", (req, res) => {
  const studentId = req.params.id;
  const { name, rollNo, email, password, address, batch, dept, course, faculty } = req.body;

  const query = `
    UPDATE student
    SET Name = ?, Roll_no = ?, Email = ?, password = ?, Address = ?, Batch = ?, Dept_ID = ?, Course_ID = ?, Faculty_id = ?
    WHERE Student_id = ?`;

  db.query(
    query,
    [name, rollNo, email, password, address, batch, dept, course, faculty, studentId],
    (err, result) => {
      if (err) return res.status(500).send(err);
      if (result.affectedRows === 0) {
        return res.status(404).send("Student not found");
      }
      res.send("Student updated successfully");
    }
  );
});

// Delete a student by ID
app.delete("/students/:id", (req, res) => {
  const studentId = req.params.id;

  // Queries for related tables
  const deleteAppointmentQuery = "DELETE FROM appointment WHERE Student_id = ?";
  const deleteMentorCardQuery = "DELETE FROM mentor_card WHERE student_id = ?";
  const deleteStudentQuery = "DELETE FROM student WHERE Student_id = ?";

  db.beginTransaction((err) => {
    if (err) {
      console.error("Error starting transaction:", err);
      return res.status(500).json({ message: "Failed to delete student" });
    }

    // Step 1: Delete related records in the `appointment` table
    db.query(deleteAppointmentQuery, [studentId], (err) => {
      if (err) {
        return db.rollback(() => {
          console.error("Error deleting appointments:", err);
          res.status(500).json({ message: "Failed to delete student appointments" });
        });
      }

      // Step 2: Delete related records in the `mentor_card` table
      db.query(deleteMentorCardQuery, [studentId], (err) => {
        if (err) {
          return db.rollback(() => {
            console.error("Error deleting mentor cards:", err);
            res.status(500).json({ message: "Failed to delete student mentor cards" });
          });
        }

        // Step 3: Delete the student record
        db.query(deleteStudentQuery, [studentId], (err, result) => {
          if (err) {
            return db.rollback(() => {
              console.error("Error deleting student:", err);
              res.status(500).json({ message: "Failed to delete student" });
            });
          }

          if (result.affectedRows === 0) {
            return db.rollback(() => {
              res.status(404).json({ message: "Student not found" });
            });
          }

          // Step 4: Commit transaction
          db.commit((err) => {
            if (err) {
              return db.rollback(() => {
                console.error("Error committing transaction:", err);
                res.status(500).json({ message: "Failed to delete student" });
              });
            }
            res.json({ message: "Student and related records deleted successfully" });
          });
        });
      });
    });
  });
});



/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.get("/faculty/students", isAuthenticated, (req, res) => {
  // Check if Faculty_id exists in the session
  if (req.session.user && req.session.user.userType === "Faculty") {
    const facultyId = req.session.user.Faculty_id;

    // SQL query to fetch students with batch, course, and department names
    const query = `
    SELECT 
      s.Student_id, 
      s.Name, 
      s.Roll_no, 
      s.Email, 
      s.Address, 
      b.batch_name AS Batch, 
      c.Course_name AS Course_Name, 
      d.Dept_name AS Dept_Name
    FROM 
      student s
    JOIN 
      batch b ON s.Batch = b.Batch_id
    JOIN 
      course c ON s.Course_ID = c.Course_ID
    JOIN 
      department d ON s.Dept_ID = d.Dept_id
    WHERE 
      s.Faculty_id = ?`;

    db.query(query, [facultyId], (err, results) => {
      if (err) {
        console.error("Error fetching students:", err.message);
        return res.status(500).json({ message: "Database error." });
      }

      if (results.length === 0) {
        return res
          .status(404)
          .json({ message: "No students found for this faculty." });
      }

      // Send the fetched students as a response
      res.status(200).json(results);
    });
  } else {
    res
      .status(403)
      .json({ message: "Unauthorized. Faculty ID is not in the session." });
  }
});

app.post("/faculty/createMentorCard", isAuthenticated, (req, res) => {
  if (req.session.user && req.session.user.userType === "Faculty") {
    const facultyId = req.session.user.Faculty_id;
    const { studentId } = req.body;

    // SQL query to check if a mentor card already exists
    const checkQuery = `SELECT * FROM mentor_card WHERE student_id = ? AND faculty_id = ?`;

    db.query(checkQuery, [studentId, facultyId], (checkErr, results) => {
      if (checkErr) {
        console.error(
          "Error checking for existing mentor card:",
          checkErr.message
        );
        return res
          .status(500)
          .json({ message: "Error checking for existing mentor card." });
      }

      if (results.length > 0) {
        // Mentor card already exists
        return res.status(200).json({ message: "Mentor card already exists." });
      }

      // SQL query to insert a new mentor card if none exists
      const insertQuery = `
        INSERT INTO mentor_card (
          student_id, 
          faculty_id, 
          sgpa_sem1, sgpa_sem2, sgpa_sem3, sgpa_sem4, sgpa_sem5,
          sgpa_sem6, sgpa_sem7, sgpa_sem8, sgpa_sem9, sgpa_sem10, 
          cgpa_sem1, cgpa_sem2, cgpa_sem3, cgpa_sem4, cgpa_sem5, 
          cgpa_sem6, cgpa_sem7, cgpa_sem8, cgpa_sem9, cgpa_sem10, 
          co_curricular_sem1, co_curricular_sem2, co_curricular_sem3, co_curricular_sem4, co_curricular_sem5, 
          co_curricular_sem6, co_curricular_sem7, co_curricular_sem8, co_curricular_sem9, co_curricular_sem10, 
          difficulty_faced_sem1, difficulty_faced_sem2, difficulty_faced_sem3, difficulty_faced_sem4, difficulty_faced_sem5, 
          difficulty_faced_sem6, difficulty_faced_sem7, difficulty_faced_sem8, difficulty_faced_sem9, difficulty_faced_sem10, 
          disciplinary_action_sem1, disciplinary_action_sem2, disciplinary_action_sem3, disciplinary_action_sem4, disciplinary_action_sem5, 
          disciplinary_action_sem6, disciplinary_action_sem7, disciplinary_action_sem8, disciplinary_action_sem9, disciplinary_action_sem10
        ) VALUES (
          ?, ?, 
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 
          NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
        );
      `;

      db.query(
        insertQuery,
        [studentId, facultyId],
        (insertErr, insertResults) => {
          if (insertErr) {
            console.error("Error creating mentor card:", insertErr.message);
            return res
              .status(500)
              .json({ message: "Failed to create mentor card." });
          }

          res
            .status(201)
            .json({ message: "Mentor card created successfully." });
        }
      );
    });
  } else {
    res
      .status(403)
      .json({ message: "Unauthorized. Faculty ID is not in the session." });
  }
});

app.post("/faculty/deleteMentorCard", isAuthenticated, (req, res) => {
  const { studentId } = req.body;
  const query = `DELETE FROM mentor_card WHERE student_id = ?`;

  db.query(query, [studentId], (err) => {
    if (err) {
      console.error("Error deleting mentor card:", err.message);
      return res.status(500).json({ message: "Failed to delete mentor card." });
    }
    res.status(200).json({ message: "Mentor card deleted successfully." });
  });
});
//////-------------------------/////---------------------------

//////------------------------------///////------------------------





  // Fetch student details from session
  app.get('/api/student/session', (req, res) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ message: 'Unauthorized. Please log in.' });
    }

    const studentId = req.session.user.Student_id; // Retrieve student ID from session
    if (!studentId) {
      return res.status(401).json({ message: 'No student session found.' });
    }

    const query = 'SELECT Student_id, Faculty_id FROM student WHERE Student_id = ?';
    db.query(query, [studentId], (err, results) => {
      if (err) {
        console.error('Database error:', err.message);
        return res.status(500).json({ message: 'Database error' });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: 'Student not found.' });
      }
      res.status(200).json(results[0]); // Send student details
    });
  });




  // Nodemailer setup (Gmail example)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'kupphu123@gmail.com',  // Replace with your Gmail address
      pass: 'qkhhtzkqemnxdkok',     // Replace with your Gmail App Password
    },
    host: 'smtp.gmail.com',
    port: 465,  // Use port 587 for TLS
    secure: false,  // This ensures that the connection is encrypted using TLS
    tls: {
      rejectUnauthorized: false,  // Allows self-signed certificates (disable if not required)
    },
  });


  // Function to send email to faculty
  const sendEmailToFaculty = (facultyEmail, subject, text) => {
    const mailOptions = {
      from: 'kupphu123@gmail.com',  // Sender email
      to: facultyEmail,  // Recipient email
      subject: subject,  // Email subject
      text: text,  // Email body
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    });
  };



  // Create a new appointment and send email to faculty
  app.post('/api/appointments', (req, res) => {
    const { studentId, facultyId, appointmentDate, appointmentTime, message, status } = req.body;

    if (!studentId || !facultyId || !appointmentDate || !appointmentTime) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const facultyQuery = 'SELECT Email, Name FROM faculty WHERE Faculty_id = ?';
    db.query(facultyQuery, [facultyId], (err, facultyResults) => {
      if (err) {
        console.error('Error fetching faculty data:', err.message);
        return res.status(500).json({ message: 'Error fetching faculty data.' });
      }

      if (facultyResults.length === 0) {
        return res.status(404).json({ message: 'Faculty not found.' });
      }

      const facultyEmail = facultyResults[0].Email;
      const facultyName = facultyResults[0].Name;

      // Insert appointment into the database
      const insertAppointmentQuery = `
        INSERT INTO appointment (Date, Time, Status, Message, Faculty_id, Student_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const values = [appointmentDate, appointmentTime, status, message, facultyId, studentId];

      db.query(insertAppointmentQuery, values, (err, results) => {
        if (err) {
          console.error('Database error:', err.message);
          return res.status(500).json({ message: 'Database error.' });
        }

        // Send email to faculty
        const subject = 'New Appointment Request';
        const text = `Dear ${facultyName},\n\nA student has requested an appointment on ${appointmentDate} at ${appointmentTime}. Message: ${message}.`;
        sendEmailToFaculty(facultyEmail, subject, text);

        res.status(201).json({ message: 'Appointment request submitted.', appointmentId: results.insertId });
      });
    });
  });

  // Delete an appointment and send email to faculty
  app.delete('/api/appointments/:appointmentId', (req, res) => {
    const { appointmentId } = req.params;

    // Query to get faculty details
    const appointmentQuery = 'SELECT Faculty_id FROM appointment WHERE Appointment_id = ?';
    db.query(appointmentQuery, [appointmentId], (err, appointmentResults) => {
      if (err) {
        console.error('Error fetching appointment data:', err.message);
        return res.status(500).json({ message: 'Error fetching appointment data.' });
      }

      if (appointmentResults.length === 0) {
        return res.status(404).json({ message: 'Appointment not found.' });
      }

      const facultyId = appointmentResults[0].Faculty_id;

      // Fetch faculty details
      const facultyQuery = 'SELECT Email, Name FROM faculty WHERE Faculty_id = ?';
      db.query(facultyQuery, [facultyId], (err, facultyResults) => {
        if (err) {
          console.error('Error fetching faculty data:', err.message);
          return res.status(500).json({ message: 'Error fetching faculty data.' });
        }

        if (facultyResults.length === 0) {
          return res.status(404).json({ message: 'Faculty not found.' });
        }

        const facultyEmail = facultyResults[0].Email;
        const facultyName = facultyResults[0].Name;

        // Delete the appointment
        const deleteQuery = 'DELETE FROM appointment WHERE Appointment_id = ?';
        db.query(deleteQuery, [appointmentId], (err, results) => {
          if (err) {
            console.error('Error deleting appointment:', err.message);
            return res.status(500).json({ message: 'Error deleting appointment.' });
          }

          // Send email to faculty
          const subject = 'Appointment Cancelled';
          const text = `Dear ${facultyName},\n\nThe appointment scheduled for you has been cancelled.`;

          sendEmailToFaculty(facultyEmail, subject, text);

          res.status(200).json({ message: 'Appointment deleted successfully.' });
        });
      });
    });
  });

  // Fetch appointments for a specific student
  app.get('/api/appointments/:studentId', (req, res) => {
    const studentId = req.params.studentId;
    const query = 'SELECT * FROM appointment WHERE Student_id = ? ORDER BY Date DESC, Time DESC';

    db.query(query, [studentId], (err, results) => {
      if (err) {
        console.error('Database error:', err.message);
        return res.status(500).json({ message: 'Database error.' });
      }
      res.status(200).json(results);
    });
  });
  //////////////////////////////////////////////////////////////////
// Get appointments for logged-in faculty, including feedback
app.get('/appointments', isAuthenticated, (req, res) => {
  const facultyId = req.session.user.Faculty_id;

  const query = `
    SELECT 
      a.Appointment_id AS id,
      a.Date AS date,
      a.Time AS time,
      a.Status AS status,
      s.Name AS student,
      s.Student_id,
      s.Roll_no,
      s.Batch,
      s.Course_ID,
      c.Course_name,
      b.batch_name,
      a.feedback  -- Include feedback field
    FROM appointment a
    JOIN student s ON a.Student_id = s.Student_id
    JOIN course c ON s.Course_ID = c.Course_ID
    JOIN batch b ON s.Batch = b.Batch_id
    WHERE a.Faculty_id = ?
  `;

  db.query(query, [facultyId], (err, results) => {
    if (err) {
      console.error('Error fetching appointments:', err);
      return res.status(500).json({ message: 'Server error' });
    }
    res.json(results);
  });
});


// Update appointment status (Approve/Reject)
app.post('/appointments/status', isAuthenticated, (req, res) => {
  const { appointmentId, status } = req.body;
  const facultyId = req.session.user.Faculty_id;

  const updateQuery = `
    UPDATE appointment
    SET Status = ?
    WHERE Appointment_id = ? AND Faculty_id = ?
  `;

  db.query(updateQuery, [status, appointmentId, facultyId], (err) => {
    if (err) {
      console.error('Error updating status:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    res.json({ message: 'Appointment updated successfully.' });
  });
});

// Automatically move expired appointments to history (for missed appointments)
const expireAppointments = () => {
  const expireQuery = `
    UPDATE appointment
    SET Status = 'Expired'
    WHERE Status = 'Pending' AND Date < CURDATE()
  `;

  db.query(expireQuery, (err) => {
    if (err) {
      console.error('Error expiring appointments:', err);
    }
  });
};

// Run expireAppointments periodically (e.g., once every hour)
setInterval(expireAppointments, 60 * 60 * 1000);

// Get history appointments (Rejected/Expired) with feedback
app.get('/appointments/history', isAuthenticated, (req, res) => {
  const facultyId = req.session.user.Faculty_id;

  const query = `
    SELECT 
      a.Appointment_id AS id,
      a.Date AS date,
      a.Time AS time,
      a.Status AS status,
      s.Name AS student,
      a.feedback -- Include feedback field in the results
    FROM appointment a
    JOIN student s ON a.Student_id = s.Student_id
    WHERE a.Faculty_id = ? AND (a.Status = 'Rejected' OR a.Status = 'Expired')
  `;

  db.query(query, [facultyId], (err, results) => {
    if (err) {
      console.error('Error fetching history:', err);
      return res.status(500).json({ message: 'Server error' });
    }
    res.json(results);
  });
});


// Cancel Appointment and move to Pending with Hold status
app.post('/appointments/cancel', isAuthenticated, (req, res) => {
  const { appointmentId } = req.body;
  const facultyId = req.session.user.Faculty_id;

  const updateQuery = `
    UPDATE appointment
    SET Status = 'Hold'
    WHERE Appointment_id = ? AND Faculty_id = ?
  `;

  db.query(updateQuery, [appointmentId, facultyId], (err) => {
    if (err) {
      console.error('Error cancelling appointment:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    res.json({ message: 'Appointment status updated to Hold successfully.' });
  });
});

// Mark Appointment as Fail and Move to History
app.post('/appointments/fail', isAuthenticated, (req, res) => {
  const { appointmentId } = req.body;
  const facultyId = req.session.user.Faculty_id;

  const updateQuery = `
    UPDATE appointment
    SET Status = 'Failed'
    WHERE Appointment_id = ? AND Faculty_id = ?
  `;

  db.query(updateQuery, [appointmentId, facultyId], (err) => {
    if (err) {
      console.error('Error marking appointment as failed:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    res.json({ message: 'Appointment marked as failed successfully.' });
  });
});
// Update appointment with feedback
app.post('/appointments/feedback', isAuthenticated, (req, res) => {
  const { appointmentId, feedback } = req.body;
  const facultyId = req.session.user.Faculty_id;

  const updateQuery = `
    UPDATE appointment
    SET feedback = ?
    WHERE Appointment_id = ? AND Faculty_id = ?
  `;

  db.query(updateQuery, [feedback, appointmentId, facultyId], (err) => {
    if (err) {
      console.error('Error updating feedback:', err);
      return res.status(500).json({ message: 'Server error' });
    }

    res.json({ message: 'Feedback submitted successfully.' });
  });
});

/////////////////////////////////////////////////
app.get("/student/profile", isAuthenticated, (req, res) => {
  const studentId = req.session.user.Student_id;

  const query = `
    SELECT s.Student_id, s.Name, s.Roll_no, s.Email, s.mobile_no, s.photo, 
           b.batch_name, d.Dept_name, c.Course_name, f.Name as Faculty_name
    FROM student s
    JOIN batch b ON s.Batch = b.Batch_id
    JOIN course c ON s.Course_ID = c.Course_ID
    JOIN department d ON s.Dept_ID = d.Dept_id
    JOIN faculty f ON s.Faculty_id = f.Faculty_id
    WHERE s.Student_id = ?`;

  db.query(query, [studentId], (err, results) => {
    if (err) {
      console.error("Error fetching student profile:", err.message);
      return res.status(500).json({ message: "Database error." });
    }

    if (results.length > 0) {
      res.status(200).json({ profile: results[0] });
    } else {
      res.status(404).json({ message: "Student not found." });
    }
  });
})
// //////////////////////////////////////////////////////////////////////






// Serve static files (images) from the uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Fetch Student Profile
app.get('/student/profile', (req, res) => {
  const studentId = req.session.user.Student_id;

  const query = `
    SELECT s.Student_id, s.Name, s.Roll_no, s.Email, s.mobile_no, s.photo, 
           b.batch_name, d.Dept_name, c.Course_name, f.Name as Faculty_name
    FROM student s
    JOIN batch b ON s.Batch = b.Batch_id
    JOIN course c ON s.Course_ID = c.Course_ID
    JOIN department d ON s.Dept_ID = d.Dept_id
    JOIN faculty f ON s.Faculty_id = f.Faculty_id
    WHERE s.Student_id = ?
  `;

  db.query(query, [studentId], (err, results) => {
    if (err) {
      console.error('Error fetching student profile:', err.message);
      return res.status(500).json({ message: 'Database error.' });
    }

    if (results.length > 0) {
      res.status(200).json({ profile: results[0] });
    } else {
      res.status(404).json({ message: 'Student not found.' });
    }
  });
});

// Update Student Profile (Mobile Number and Photo)
app.post('/student/update', upload.single('photo'), (req, res) => {
  const studentId = req.session.user.Student_id;
  const { mobile_no } = req.body;
  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

  const updates = [];
  if (mobile_no) updates.push(`mobile_no = '${mobile_no}'`);
  if (photoPath) updates.push(`photo = '${photoPath}'`);

  if (updates.length === 0) {
    return res.status(400).json({ message: 'No data provided to update.' });
  }

  const updateQuery = `UPDATE student SET ${updates.join(', ')} WHERE Student_id = ?`;

  db.query(updateQuery, [studentId], (err) => {
    if (err) {
      console.error('Error updating profile:', err.message);
      return res.status(500).json({ message: 'Profile update failed.' });
    }
    res.status(200).json({ message: 'Profile updated successfully.' });
  });
});

// Change Password
app.post('/student/change-password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const studentId = req.session.user.Student_id;

  const fetchPasswordQuery = 'SELECT password FROM student WHERE Student_id = ?';
  db.query(fetchPasswordQuery, [studentId], (err, results) => {
    if (err || results.length === 0) {
      return res.status(500).json({ message: 'User not found.' });
    }

    const currentPassword = results[0].password;
    if (oldPassword !== currentPassword) {
      return res.status(401).json({ message: 'Old password is incorrect.' });
    }

    const updatePasswordQuery = 'UPDATE student SET password = ? WHERE Student_id = ?';
    db.query(updatePasswordQuery, [newPassword, studentId], (updateErr) => {
      if (updateErr) {
        return res.status(500).json({ message: 'Password update failed.' });
      }
      res.status(200).json({ message: 'Password updated successfully.' });
    });
  });
});
///////////////////////////////////////////////////////////////////
app.get('/mentor-card', (req, res) => {
  const studentId = req.session.user?.Student_id;

  if (!studentId) {
    return res.status(401).json({ error: 'Student ID not found in session.' });
  }

  const mentorCardQuery = `
    SELECT 
      student.Student_id, 
      student.Name, 
      student.Roll_no, 
      student.Email, 
      student.mobile_no, 
      student.password, 
      student.Address, 
      student.photo, 
      student.Batch, 
      student.Dept_ID, 
      student.Course_ID, 
      faculty.Name AS Faculty_Name, 
      course.Course_name, 
      mentor_card.* 
    FROM mentor_card
    JOIN student ON student.Student_id = mentor_card.student_id
    JOIN faculty ON faculty.Faculty_id = student.Faculty_id
    JOIN course ON course.Course_ID = student.Course_ID
    WHERE mentor_card.student_id = ?`;

  db.query(mentorCardQuery, [studentId], (err, results) => {
    if (err) {
      console.error('Error fetching mentor card:', err.message);
      return res.status(500).json({ error: 'Error fetching mentor card data.' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'No mentor card found for this student.' });
    }

    const data = results[0];

    res.status(200).json({
      mentorCard: data,
      student: {
        Student_id: data.Student_id,
        Name: data.Name,
        Roll_no: data.Roll_no,
        photo: data.photo, // Send only filename
        Course_ID: data.Course_ID,
        Course_name: data.Course_name,
      },
      faculty: {
        Name: data.Faculty_Name,
        Email: data.Email,
      },
    });
  });
});

////////////////////////////////////////////////////////
// Serve static files (like images) from the 'uploads' folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Route to fetch mentor card details
app.get('/mentor-card/:Student_id', (req, res) => {
  const { Student_id } = req.params; // Retrieve student ID from URL parameters

  if (!Student_id) {
    return res.status(400).json({ error: 'Student ID is required.' });
  }

  const mentorCardQuery = `
    SELECT 
      student.Student_id, 
      student.Name, 
      student.Roll_no, 
      student.Email, 
      student.mobile_no, 
      student.password, 
      student.Address, 
      student.photo, 
      student.Batch, 
      student.Dept_ID, 
      student.Course_ID, 
      faculty.Name AS Faculty_Name, 
      course.Course_name, 
      mentor_card.* 
    FROM mentor_card
    JOIN student ON student.Student_id = mentor_card.student_id
    JOIN faculty ON faculty.Faculty_id = student.Faculty_id
    JOIN course ON course.Course_ID = student.Course_ID
    WHERE mentor_card.student_id = ?`;

  db.query(mentorCardQuery, [Student_id], (err, results) => {
    if (err) {
      console.error('Error fetching mentor card:', err.message);
      return res.status(500).json({ error: 'Error fetching mentor card data.' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'No mentor card found for this student.' });
    }

    const data = results[0];

    // Send response with mentor, student, and faculty details
    res.status(200).json({
      mentorCard: data,
      student: {
        Student_id: data.Student_id,
        Name: data.Name,
        Roll_no: data.Roll_no,
        photo: data.photo, // Send only the filename, not full path
        Course_ID: data.Course_ID,
        Course_name: data.Course_name,
      },
      faculty: {
        Name: data.Faculty_Name,
        Email: data.Email,
      },
    });
  });
});
//////////////////////////////////////////////////////
// Fetch all students assigned to the faculty
app.get("/get-students", isAuthenticated, (req, res) => {
  const facultyId = req.session.user.Faculty_id;

  const query = `
    SELECT s.Student_id, s.Name, s.Roll_no, s.Email, s.mobile_no, s.password, s.Address, s.photo, s.Batch, s.Dept_ID, s.Course_ID, s.Faculty_id
    FROM student AS s
    INNER JOIN mentor_card AS mc ON s.Student_id = mc.student_id
    WHERE mc.faculty_id = ?`;

  db.query(query, [facultyId], (err, results) => {
    if (err) {
      console.error("Error fetching students:", err.message);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({ students: results });
  });
});

// Fetch mentor card details for the selected student
app.get("/get-mentor-card/:id", isAuthenticated, (req, res) => {
  const studentId = req.params.id;

  const query = "SELECT * FROM mentor_card WHERE student_id = ?";
  db.query(query, [studentId], (err, results) => {
    if (err) {
      console.error("Error fetching mentor card:", err.message);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length > 0) {
      res.json({ mentorCard: results[0] });
    } else {
      res.status(404).json({ error: "No mentor card found for this student" });
    }
  });
});

// Dynamically update mentor card details for the selected student
app.post("/update-mentor-card/:id", isAuthenticated, (req, res) => {
  const studentId = req.params.id;
  const updates = req.body; // All mentor card fields to update dynamically

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No data provided for update" });
  }

  // Construct SET clause dynamically
  const setClause = Object.keys(updates)
    .map((key) => `${key} = ?`)
    .join(", ");

  const values = [...Object.values(updates), studentId];

  const query = `UPDATE mentor_card SET ${setClause} WHERE student_id = ?`;

  db.query(query, values, (err) => {
    if (err) {
      console.error("Error updating mentor card:", err.message);
      return res.status(500).json({ error: "Failed to update mentor card" });
    }
    res.json({ message: "Mentor card updated successfully" });
  });
});

////////////////////////////////////////////////
app.get('/faculty/profile', isAuthenticated, (req, res) => {
  const facultyId = req.session.user.Faculty_id;
  const query = `
    SELECT f.Faculty_id, f.Name, f.Email, d.Dept_name
    FROM faculty f
    JOIN department d ON f.Dept_ID = d.Dept_ID
    WHERE f.Faculty_id = ?
  `;
  db.query(query, [facultyId], (err, results) => {
    if (err) {
      console.error('Error fetching faculty profile:', err);
      return res.status(500).json({ message: 'Server error' });
    }
    res.json(results[0]);
  });
});
app.post('/faculty/update-password', isAuthenticated, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const facultyId = req.session.user.Faculty_id;

  const query = 'SELECT password FROM faculty WHERE Faculty_id = ?';
  db.query(query, [facultyId], (err, results) => {
    if (err || results.length === 0) {
      return res.status(500).json({ message: 'Server error or user not found' });
    }

    const currentPassword = results[0].password;
    if (currentPassword !== oldPassword) {
      return res.status(400).json({ message: 'Incorrect old password' });
    }

    const updateQuery = 'UPDATE faculty SET password = ? WHERE Faculty_id = ?';
    db.query(updateQuery, [newPassword, facultyId], (err) => {
      if (err) {
        return res.status(500).json({ message: 'Failed to update password' });
      }
      res.json({ message: 'Password updated successfully' });
    });
  });
});
////////////////////////////////////////////////////////////////////////
// Upload Students Route
app.post("/upload-students", (req, res) => {
  const { data, batchDetails } = req.body;

  if (!data || !batchDetails) {
    return res.status(400).json({ error: "Invalid data provided." });
  }

  const batchData = data.map((student) => [
    student.Name,
    student.Roll_no,
    student.Email,
    student.mobile_no,
    student.password,
    student.Address,
    student.photo || null,
    batchDetails.Batch,
    batchDetails.Dept_ID,
    batchDetails.Course_ID,
    batchDetails.Faculty_id,
  ]);

  const query =
    "INSERT INTO student (Name, Roll_no, Email, mobile_no, password, Address, photo, Batch, Dept_ID, Course_ID, Faculty_id) VALUES ?";

  db.query(query, [batchData], (err, result) => {
    if (err) {
      console.error("Error inserting students:", err);
      return res.status(500).json({ error: "Failed to upload students." });
    }
    res.status(201).json({ message: "Students uploaded successfully." });
  });
});
// Server-side code (Express)
app.get("/batches", (req, res) => {
  const query = "SELECT Batch_id AS id, batch_name AS name FROM batch";
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: "Error fetching batches", details: err });
    console.log("Batches fetched:", results); // Debug log
    res.json(results);
  });
});

// Route to get batch data
app.get('/api/batches', (req, res) => {
  db.query('SELECT `Batch_id`, `batch_name` FROM `batch` WHERE 1', (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// Route to get department data
app.get('/api/departments', (req, res) => {
  db.query('SELECT `Dept_id`, `Dept_name` FROM `department` WHERE 1', (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// Route to get course data
app.get('/api/courses', (req, res) => {
  db.query('SELECT `Course_ID`, `Course_name`, `Dept_ID` FROM `course` WHERE 1', (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

// Route to get faculty data
app.get('/api/faculties', (req, res) => {
  db.query('SELECT `Faculty_id`, `Name`, `Email`, `password`, `Dept_ID` FROM `faculty` WHERE 1', (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});



// Get batches
app.get("/batches", (req, res) => {
  const query = "SELECT Batch_id, batch_name FROM batch";
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching batches:", err);
      return res.status(500).json({ error: "Failed to fetch batches" });
    }
    res.json(results);
  });
});

// Get departments
app.get("/departments", (req, res) => {
  const query = "SELECT Dept_id, Dept_name FROM department";
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching departments:", err);
      return res.status(500).json({ error: "Failed to fetch departments" });
    }
    res.json(results);
  });
});

// Get courses
app.get("/courses", (req, res) => {
  const query = "SELECT Course_ID, Course_name, Dept_ID FROM course";
  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching courses:", err);
      return res.status(500).json({ error: "Failed to fetch courses" });
    }
    res.json(results);
  });
});

// Upload and process Excel file
app.post("/students/excel", upload.single("file"), (req, res) => {
  const { students } = req.body;

  if (!students || !Array.isArray(students)) {
    return res.status(400).json({ error: "Invalid student data" });
  }

  const studentData = students.map((student) => [
    student.Name,
    student.Roll_no,
    student.Email,
    student.password,
    student.Address,
    student.Batch,
    student.Dept_ID,
    student.Course_ID,
    student.Faculty_id, // Faculty_id is set to null
  ]);

  const query =
    "INSERT INTO student (Name, Roll_no, Email, password, Address, Batch, Dept_ID, Course_ID, Faculty_id) VALUES ?";

  db.query(query, [studentData], (err, results) => {
    if (err) {
      console.error("Error inserting student data:", err);
      return res.status(500).json({ error: "Failed to insert student data" });
    }
    res.json({ message: "Students added successfully", results });
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

