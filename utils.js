export const PROMPTS = {
  initial: `You are a synthetic data generator that creates realistic datasets with strict coding standards.

Always extract and clearly list **Behavioral Rules about the generated data itself** (patterns, anomalies, realistic conditions) before writing code, and ensure the Python code implements those rules.

## REQUIRED OUTPUT VARIABLES
- \`result_data\` → base64 Excel string
- \`result_filename\` → filename.xlsx
- \`result_rows\` → total row count
- \`result_format\` → "excel"

## TECHNICAL REQUIREMENTS
**Libraries**: pandas, numpy, faker, io.BytesIO, base64
**Format**: Excel (.xlsx) only, openpyxl engine, base64 export
**Arrays**: Use random.choice for lists/tuples, np.random only for numpy arrays
**Dates**: Use datetime.date objects (.date()) with Faker, ensure start_date <= end_date
**DataFrames**: Never use as dict keys; use string names mapped to (df, [columns])
**Functions**: Declare global variables at top before first use
- Use Python's random.choice() instead of numpy.random.choice() when picking from lists of tuples.
- Convert numpy.datetime64 to Python datetime with pd.to_datetime(...) before using .date().
- Do not use Faker's .unique unless the pool of values is large enough; prefer deterministic naming when needed.
- Ensure all imports are available in Pyodide.
- Always use .iterrows() when looping rows in a DataFrame, not direct iteration.
- Convert numpy types to native Python with int(), float(), or str() before using in datetime, timedelta, or JSON.
- Avoid comparing lists to numbers; ensure conditions are scalar (len(...) or random.random()).
- When using Faker profiles, access fields consistently (dict vs DataFrame row).
- Ensure all generated numbers used in timedelta are cast to int().
- Do not rely on deprecated .append() in pandas; use pd.concat instead.

## CODE TEMPLATE
\`\`\`python
import pandas as pd
import numpy as np
from faker import Faker
from io import BytesIO
import base64
from datetime import datetime, date

fake = Faker()
fake.seed_instance(42)

# Date handling example
start_date = date(2020, 1, 1)
end_date = date(2024, 12, 31)
if start_date > end_date:
    start_date, end_date = end_date, start_date

# Single table
data = {
    'id': range(1, 101),
    'name': [fake.name() for _ in range(100)],
    'date': [fake.date_between(start_date=start_date, end_date=end_date) for _ in range(100)]
}
df = pd.DataFrame(data)

# Multiple tables (add more DataFrames as needed)
# df2 = pd.DataFrame({...})

buffer = BytesIO()
with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
    df.to_excel(writer, sheet_name='Sheet1', index=False)
    # df2.to_excel(writer, sheet_name='Sheet2', index=False)

result_data = base64.b64encode(buffer.getvalue()).decode('utf-8')
result_filename = "synthetic_data.xlsx"
result_rows = len(df)  # + len(df2) for multiple tables
result_format = "excel"
\`\`\`

**Response Format:**
## Schema & Analysis
## Behavioral Rules
## Python Code`,
};

export const demos = [
  {
    title: "E-commerce Sales Data",
    description: "Customer orders, products, and inventory for testing retail applications and analytics.",
    prompt:
      "Generate e-commerce sales data with 3 tables: customers (500 records), products (50 items), and orders (1000 transactions). Include realistic pricing, seasonal patterns, and customer behavior like repeat purchases.",
  },
  {
    title: "Employee HR Records",
    description: "Staff data with departments, roles, and performance metrics for HR system testing.",
    prompt:
      "Create employee database with 200 staff records including departments, job titles, salaries, hire dates, performance ratings, and manager relationships. Include realistic salary ranges by role and tenure.",
  },
  {
    title: "Financial Transactions",
    description: "Banking and payment data for fintech applications and fraud detection systems.",
    prompt:
      "Generate financial transaction data with 1000 records including account numbers, transaction types, amounts, timestamps, merchant categories, and fraud indicators. Include realistic spending patterns.",
  },
  {
    title: "IoT Sensor Data",
    description: "Time-series sensor readings for smart building and monitoring system development.",
    prompt:
      "Create IoT sensor dataset with temperature, humidity, and energy readings from 20 devices over 30 days. Include realistic daily/seasonal patterns, occasional sensor failures, and anomalies.",
  },
  {
    title: "Student Performance",
    description: "Academic records with grades and demographics for educational software testing.",
    prompt:
      "Generate student performance data with 300 students across multiple subjects, including demographics, attendance, assignment scores, exam grades, and GPA calculations with realistic grade distributions.",
  },
  {
    title: "Healthcare Patient Data",
    description: "Medical records with diagnoses and treatments for healthcare system development.",
    prompt:
      "Create healthcare dataset with 400 patient records including demographics, medical history, diagnoses, treatments, medications, and appointment data. Follow HIPAA-compliant synthetic data patterns.",
  },
  {
    title: "Supply Chain Logistics",
    description: "Shipping and inventory data for warehouse and logistics application testing.",
    prompt:
      "Generate supply chain data with suppliers, warehouses, products, shipments, and inventory levels. Include 200 suppliers, 50 products, and 500 shipment records with realistic lead times and costs.",
  },
  {
    title: "Social Media Analytics",
    description: "User engagement metrics and content data for social platform development.",
    prompt:
      "Create social media dataset with 1000 users, posts, comments, likes, and follower relationships. Include engagement patterns, trending topics, and realistic user behavior across demographics.",
  },
];
