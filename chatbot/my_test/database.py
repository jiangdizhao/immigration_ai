import psycopg2

conn = psycopg2.connect(
    database="immigration_ai",
    user="postgres",
    password="1225",
    host="localhost",
    port="5432"
)

cursor = conn.cursor()

cursor.execute("SELECT * FROM users;")

rows = cursor.fetchall()

for r in rows:
    print(r)

conn.close()