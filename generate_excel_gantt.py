import os

def generate_gantt_html(output_path):
    # Definition of the project phases and activities
    phases = [
        {
            "name": "A. DATABASE SCHEMA & BACKEND INITIALIZATION",
            "tasks": [
                {
                    "id": "1",
                    "task": "Supabase database schema initialization & public profiles setup",
                    "weeks": [1, 2]
                },
                {
                    "id": "2",
                    "task": "Geospatial database setup with PostGIS support for pond boundaries",
                    "weeks": [2]
                },
                {
                    "id": "3",
                    "task": "Admin-scoped RPC and settings audit trails database structure",
                    "weeks": [2]
                }
            ]
        },
        {
            "name": "B. MOBILE APP DEVELOPMENT",
            "tasks": [
                {
                    "id": "4",
                    "task": "Mobile app navigation & Supabase client auth flow integration",
                    "weeks": [3, 4]
                },
                {
                    "id": "5",
                    "task": "Local WatermelonDB/AsyncStorage offline sync queue engine",
                    "weeks": [4, 5]
                },
                {
                    "id": "6",
                    "task": "Pond boundary capture map screen & GPS locator utility",
                    "weeks": [5]
                },
                {
                    "id": "7",
                    "task": "Data entry logs: stocking, mortality, and harvests tracking pages",
                    "weeks": [5, 6]
                },
                {
                    "id": "8",
                    "task": "Pond historical records review and sync queue status GUI",
                    "weeks": [6]
                }
            ]
        },
        {
            "name": "C. WEB ADMIN CONSOLE CORE SETUP",
            "tasks": [
                {
                    "id": "9",
                    "task": "Next.js project setup, routing, and role-based route middleware",
                    "weeks": [7]
                },
                {
                    "id": "10",
                    "task": "Admin authentication flow UI (Login, reset password screens)",
                    "weeks": [7, 8]
                },
                {
                    "id": "11",
                    "task": "Operational overview dashboard cards & metrics cards layout",
                    "weeks": [8]
                },
                {
                    "id": "12",
                    "task": "Field staff account promotion, user approvals, and profile repair flow",
                    "weeks": [8]
                }
            ]
        },
        {
            "name": "D. ADMIN CONSOLE DEEP CONSTRUCTION (STARTING FROM ZERO)",
            "tasks": [
                {
                    "id": "13",
                    "task": "Interactive GIS Map Dashboard: Pond boundary visualizer & layer toggles",
                    "weeks": [9, 10]
                },
                {
                    "id": "14",
                    "task": "Analytics Panel: Mortality trends, FCR, and harvest biomass charts",
                    "weeks": [10, 11]
                },
                {
                    "id": "15",
                    "task": "Feed Inventory Management and stocking planning logs page",
                    "weeks": [11]
                },
                {
                    "id": "16",
                    "task": "Admin Settings Console: System config editor with audit histories",
                    "weeks": [11, 12]
                }
            ]
        },
        {
            "name": "E. BACKEND SERVICES & AI REPORTING",
            "tasks": [
                {
                    "id": "17",
                    "task": "AI-Powered Assistant: Report compiler & chat interface integration",
                    "weeks": [12]
                },
                {
                    "id": "18",
                    "task": "Automated data verification, anomaly detection, and sync error alerts",
                    "weeks": [12, 13]
                }
            ]
        },
        {
            "name": "F. TESTING & SYSTEM VALIDATION",
            "tasks": [
                {
                    "id": "19",
                    "task": "Admin Dashboard (for Advisor Testing)",
                    "weeks": [13, 14]
                },
                {
                    "id": "20",
                    "task": "End-to-end sync testing, bug reporting, and unit test suites",
                    "weeks": [14, 15]
                },
                {
                    "id": "21",
                    "task": "Expo EAS native builds compilation & Next.js production hosting deployment",
                    "weeks": [15, 16]
                }
            ]
        },
        {
            "name": "G. SYSTEM DOCUMENTATION",
            "tasks": [
                {
                    "id": "22",
                    "task": "Chapter I – Introduction (incl. system scope & objectives)",
                    "weeks": [1, 2, 3, 4]
                },
                {
                    "id": "23",
                    "task": "Chapter II – Thematic Review of Related Literature",
                    "weeks": [2, 3, 4, 5]
                },
                {
                    "id": "24",
                    "task": "Chapter III – Technical Background (Supabase, React Native, Next.js)",
                    "weeks": [4, 5, 6]
                },
                {
                    "id": "25",
                    "task": "Chapter IV – Research Methodology (DFDs, ERD, HIPO, Flowchart)",
                    "weeks": [6, 7, 8, 9]
                },
                {
                    "id": "26",
                    "task": "Chapter V – Results & Discussion",
                    "weeks": [13, 14, 15]
                },
                {
                    "id": "27",
                    "task": "Chapter VI – Summary, Conclusion & Recommendation",
                    "weeks": [15, 16]
                },
                {
                    "id": "28",
                    "task": "Bibliography (APA 7th Edition) & Appendices",
                    "weeks": [15, 16]
                },
                {
                    "id": "29",
                    "task": "Final Manuscript Proofreading, Formatting & Binding",
                    "weeks": [16]
                }
            ]
        }
    ]

    total_weeks = 16

    html = []
    html.append("<html>")
    html.append("<head>")
    html.append("<meta charset='utf-8'>")
    html.append("<style>")
    html.append("  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; color: #1e293b; margin: 0; padding: 20px; }")
    html.append("  table { border-collapse: collapse; width: 100%; margin-top: 5px; margin-bottom: 25px; font-size: 11px; }")
    html.append("  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: middle; }")
    
    # Header styling (Nexus theme: Royal blue accents or dark slate)
    html.append("  .header-row th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; text-align: center; border: 1px solid #172554; font-size: 11px; height: 35px; }")
    html.append("  .month-row th { background-color: #1e40af; color: #ffffff; font-weight: bold; text-align: center; border: 1px solid #172554; font-size: 12px; height: 25px; }")
    html.append("  .header-left { text-align: left !important; }")
    
    # Phase headers
    html.append("  .phase-row td { background-color: #f1f5f9; font-weight: bold; color: #1e3a8a; font-size: 12px; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; }")
    
    # Task row styling
    html.append("  .task-row td { background-color: #ffffff; color: #334155; }")
    html.append("  .task-row-alt td { background-color: #f8fafc; color: #334155; }")
    html.append("  .week-cell { width: 35px; text-align: center !important; font-size: 12px; }")
    html.append("</style>")
    html.append("</head>")
    html.append("<body>")
    
    # Title / Metadata Block at the top (copied exact NexusHome style but for Aquapin)
    html.append("<table style='width: 100%; border: none; margin-bottom: 15px;'>")
    html.append("  <tr>")
    html.append("    <td colspan='18' style='border: none; font-size: 11px; font-weight: bold; color: #1e3a8a; text-align: center; font-family: \"Segoe UI\", sans-serif;'>CAGAYAN STATE UNIVERSITY – GONZAGA CAMPUS  |  College of Information and Computing Sciences  |  BSIT Program</td>")
    html.append("  </tr>")
    html.append("  <tr>")
    html.append("    <td colspan='18' style='border: none; font-size: 15px; font-weight: bold; color: #1e3a8a; text-align: center; font-family: \"Segoe UI\", sans-serif;'>AQUAPIN: An Aquaculture Management System with Offline-First Mobile App and Next.js Web Admin Console</td>")
    html.append("  </tr>")
    html.append("  <tr>")
    html.append("    <td colspan='18' style='border: none; font-size: 11px; font-weight: bold; color: #475569; text-align: center; font-family: \"Segoe UI\", sans-serif;'>GANTT CHART OF ACTIVITIES  ●  A.Y. 2025–2026  ●  July 1 – October 19, 2026  ●  FINAL DEFENSE: OCTOBER 19, 2026</td>")
    html.append("  </tr>")
    html.append("  <tr>")
    html.append("    <td colspan='18' style='border: none; font-size: 11px; font-weight: bold; color: #0f172a; text-align: center; font-family: \"Segoe UI\", sans-serif;'>Researchers: Ian Dave Punayo  ●  Angel Mae Ablog  ●  Giovanni Paolo Molina  ●  Renzo Recca Balboa</td>")
    html.append("  </tr>")
    html.append("  <tr>")
    html.append("    <td colspan='18' style='border: none; font-size: 11px; font-style: italic; color: #334155; text-align: center; font-family: \"Segoe UI\", sans-serif;'>Adviser: ___________________________          Capstone In-charge: VERDICT L. GONZALES, PhD, DIT</td>")
    html.append("  </tr>")
    html.append("  <tr>")
    html.append("    <td colspan='18' style='border: none; font-size: 10px; color: #64748b; text-align: center; font-family: \"Segoe UI\", sans-serif;'>★ UPDATED — Includes: Next.js Admin Dashboard (for Advisor Testing)  |  Supabase Backend & PostGIS  |  React Native Offline-First Sync</td>")
    html.append("  </tr>")
    html.append("</table>")
    
    # Gantt Chart Table
    html.append("<table>")
    
    # Month Row (Row 6 in NexusHome style)
    html.append("  <tr class='month-row'>")
    html.append("    <th colspan='2' class='header-left'>ACTIVITIES</th>")
    html.append("    <th colspan='4'>July 2026</th>")
    html.append("    <th colspan='4'>August 2026</th>")
    html.append("    <th colspan='5'>September 2026</th>")
    html.append("    <th colspan='3'>October 2026</th>")
    html.append("  </tr>")
    
    # Week Headers (Row 7 in NexusHome style)
    html.append("  <tr class='header-row'>")
    html.append("    <th class='header-left' style='width: 45px;'>ID</th>")
    html.append("    <th class='header-left' style='width: 500px;'>Task / Sub-activity</th>")
    
    # Week details mapping
    weeks_info = [
        "W1<br>Jul 06", "W2<br>Jul 13", "W3<br>Jul 20", "W4<br>Jul 27",
        "W5<br>Aug 03", "W6<br>Aug 10", "W7<br>Aug 17", "W8<br>Aug 24",
        "W9<br>Aug 31", "W10<br>Sep 07", "W11<br>Sep 14", "W12<br>Sep 21", "W13<br>Sep 28",
        "W14<br>Oct 05<br>⚠DEADLINE", "W15<br>Oct 12", "W16<br>Oct 19<br>🎓DEFENSE"
    ]
    for winfo in weeks_info:
        html.append(f"    <th class='week-cell'>{winfo}</th>")
    html.append("  </tr>")
    
    # Print phases and tasks
    row_count = 0
    for phase in phases:
        # Phase separator row
        html.append("  <tr class='phase-row'>")
        html.append(f"    <td colspan='{2 + total_weeks}'>{phase['name']}</td>")
        html.append("  </tr>")
        
        for task in phase['tasks']:
            row_count += 1
            row_class = "task-row-alt" if row_count % 2 == 0 else "task-row"
            
            html.append(f"  <tr class='{row_class}'>")
            html.append(f"    <td style='font-weight: bold; color: #475569; text-align: center;'>{task['id']}</td>")
            html.append(f"    <td style='font-weight: 500;'>{task['task']}</td>")
            
            # Render week columns with checkmarks on royal blue background
            for w in range(1, total_weeks + 1):
                if w in task['weeks']:
                    # Royal Blue cell with a bold white checkmark
                    cell_style = "background-color: #3b82f6; color: #ffffff; font-weight: bold; text-align: center; border: 1px solid #1d4ed8;"
                    html.append(f"    <td style='{cell_style}'>✓</td>")
                else:
                    html.append("    <td style='background-color: #ffffff; border: 1px solid #e2e8f0;'></td>")
            html.append("  </tr>")
            
    # Add warning banner row matching Row 60 in NexusHome style
    html.append("  <tr>")
    html.append(f"    <td colspan='{2 + total_weeks}' style='background-color: #fff1f2; color: #be123c; font-weight: bold; text-align: center; padding: 10px; font-size: 11px; border: 1px solid #fecdd3;'>")
    html.append("      ⚠ ALL SOFTWARE DEVELOPMENT & INTEGRATION TASKS MUST BE COMPLETED BY OCT 05 (W14) — 2 WEEKS BEFORE FINAL DEFENSE ON OCTOBER 19, 2026")
    html.append("    </td>")
    html.append("  </tr>")
    html.append("</table>")
    
    # Legend Section
    html.append("<table style='width: 100%; border: none; margin-top: 5px; font-size: 10px;'>")
    html.append("  <tr>")
    html.append("    <td style='border: none; font-weight: bold;'>LEGEND:</td>")
    html.append("    <td style='border: none; color: #1e3a8a;'>A. Requirements & DB Setup</td>")
    html.append("    <td style='border: none; color: #1e3a8a;'>B. Mobile Development</td>")
    html.append("    <td style='border: none; color: #1e3a8a;'>C. Web Console Core</td>")
    html.append("    <td style='border: none; color: #1e3a8a;'>D. Admin Construction</td>")
    html.append("    <td style='border: none; color: #1e3a8a;'>E. Backend & AI Services</td>")
    html.append("    <td style='border: none; color: #1e3a8a;'>F. Testing & Validation</td>")
    html.append("    <td style='border: none; color: #1e3a8a;'>G. Documentation Chapters</td>")
    html.append("    <td style='border: none; font-weight: bold; color: #be123c;'>⚠ Oct 05 Deadline / 🎓 Oct 19 Defense</td>")
    html.append("  </tr>")
    html.append("</table>")
    
    # Adviser signoff section at the bottom (Row 64 in NexusHome style)
    html.append("<br><br>")
    html.append("<table style='width: 100%; margin-top: 15px; border: none;'>")
    html.append("  <tr>")
    html.append("    <td style='border: none; font-size: 11px; width: 33%;'>Prepared by (Group Leader): ___________________________  Date: ___________</td>")
    html.append("    <td style='border: none; font-size: 11px; width: 33%;'>Checked by (Adviser): ___________________________  Date: ___________</td>")
    html.append("    <td style='border: none; font-size: 11px; width: 34%;'>Noted by (Capstone In-charge): ___________________________  Date: ___________</td>")
    html.append("  </tr>")
    html.append("  <tr>")
    html.append("    <td style='border: none; font-size: 9px; color: #64748b; padding-left: 100px;'>Ian Dave Punayo</td>")
    html.append("    <td style='border: none; font-size: 9px; color: #64748b; padding-left: 100px;'>Project Adviser</td>")
    html.append("    <td style='border: none; font-size: 9px; color: #64748b; padding-left: 100px;'>VERDICT L. GONZALES, PhD, DIT</td>")
    html.append("  </tr>")
    html.append("</table>")
    
    # Document footer description (Row 65 in NexusHome style)
    html.append("<table style='width: 100%; border: none; margin-top: 20px; font-size: 9px; color: #64748b;'>")
    html.append("  <tr>")
    html.append("    <td style='border: none; text-align: center;'>Aquapin  ●  BSIT Program  ●  Cagayan State University – Gonzaga Campus  ●  A.Y. 2025–2026  ●  Long Bond Paper / Transparent Clearbook</td>")
    html.append("  </tr>")
    html.append("</table>")
    
    html.append("</body>")
    html.append("</html>")
    
    # Save the file
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(html))
    print(f"HTML generated at: {output_path}")

if __name__ == "__main__":
    out_html = "/home/ian/Desktop/Aquapin/Aquapin_Project_Gantt_Chart.xls"
    generate_gantt_html(out_html)
