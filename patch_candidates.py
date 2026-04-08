import sys

file_path = r'c:\Users\Jeevan Konduru\OneDrive\Desktop\youtube\Ats Platform\backend\src\modules\candidates\routes.js'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line numbers in view_file are 1-indexed.
# 543 is lines[542]
# 582 is lines[581]

start_idx = 542 # line 543
end_idx = 582   # line 583 (exclusive of end_idx means it replaces up to 582)

new_content = """        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          totalExperienceYears: true,
          currentCompany: true,
          source: true,
          category: true,
          createdAt: true,
          profilePhotoFile: {
            select: {
              id: true,
              storageKey: true,
            },
          },
          applications: {
            select: {
              id: true,
              status: true,
              shortlisted: true,
              currentStage: {
                select: { id: true, name: true },
              },
            },
          },
          _count: {
            select: { applications: true },
          },
        },\n"""

# Verify the lines we are replacing to be safe
print(f"Replacing lines {start_idx+1} to {end_idx}:")
print(lines[start_idx].strip())
print("...")
print(lines[end_idx-1].strip())

if 'include: {' in lines[start_idx]:
    lines[start_idx:end_idx] = [new_content]
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Optimization applied successfully.")
else:
    print("Error: Target content mismatch.")
    sys.exit(1)
