from fastapi import FastAPI
from pydantic import BaseModel
import psycopg2

app = FastAPI()

students = [
    {"id": 1, "name": "Alice", "age": 22},
    {"id": 2, "name": "Bob", "age": 21}
]

class Student(BaseModel):
    name: str
    age: int
    major: str


class ChatRequest(BaseModel):
    message: str

def get_db_immigration():
    conn =  psycopg2.connect(
        database = "immigration_ai",
        user = "postgres",
        password = "1225", 
        host = "localhost",
        port = "5432" 
    )
    return conn


def get_db_school():
    conn =  psycopg2.connect(
        database = "school",
        user = "postgres",
        password = "1225", 
        host = "localhost",
        port = "5432" 
    )
    return conn


@app.get("/")
def home():
    return {"message": "Immigration AI backend running"}

@app.get("/users")
def get_users():
    conn = get_db_immigration()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM users")
    rows = cursor.fetchall()

    result = []
    for r in rows:
        result.append(
            {
                "id": r[0],
                "name": r[1],
                "email": r[2]
            }
        )
    conn.close()
    return result


@app.get("/students")
def get_students():
    conn = get_db_school()
    cur = conn.cursor()

    cur.execute("SELECT id, name, age, major FROM students;")
    rows = cur.fetchall()

    cur.close()
    conn.close()

    students = []
    for row in rows:
        students.append({
            "id": row[0],
            "name": row[1],
            "age": row[2],
            "major": row[3]
        })

    return students


# @app.get("/students/{student_id}")
# def get_student(student_id: int):
#     for student in students:
#         if student["id"] == student_id:
#             return student
#     return {"error": "Student not found"}



@app.post("/chat")
def chat(req: ChatRequest):
    user_message = req.message
    answer = f"You asked: {user_message}"
    return {"response": answer}


@app.post("/students")
def create_student(student: Student):
    conn = get_db_school()
    cur = conn.cursor()

    cur.execute(
        "INSERT INTO students (name, age, major) VALUES (%s, %s, %s) RETURNING id;",
        (student.name, student.age, student.major)
    )

    new_id = cur.fetchone()[0]
    conn.commit()

    cur.close()
    conn.close()

    return {
        "message": "Student added successfully",
        "student": {
            "id": new_id,
            "name": student.name,
            "age": student.age,
            "major": student.major
        }
    }

# @app.post("/students")
# def create_student(student: Student):
#     new_student = {
#         "id": len(students) + 1,
#         "name": student.name,
#         "age": student.age,
#         "major": student.major
#     }
#     students.append(new_student)
#     return {"message": "Student added", "student": new_student}

