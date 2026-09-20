import io
from datetime import datetime, timezone
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from app.models.sprint import Sprint
from app.models.user import User
from app.schemas.sprint import SprintAnalytics


class NumberedCanvas(canvas.Canvas):
    """Two-pass canvas to dynamically compute and stamp total page count and professional footer."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        page_width, page_height = letter

        # Running Footer separator line
        self.setStrokeColor(colors.HexColor("#E2E8F0"))
        self.setLineWidth(0.75)
        self.line(36, 32, page_width - 36, 32)

        # Running Footer text
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(36, 20, "BugTracker • Intelligent Defect Tracking System • Agile Sprint Performance Report")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(page_width - 36, 20, page_str)

        self.restoreState()


def generate_sprint_report(
    sprint: Sprint,
    analytics: SprintAnalytics,
    generated_by: User | None = None,
) -> io.BytesIO:
    buffer = io.BytesIO()
    # 36pt (0.5 in) margins -> Printable width = 612 - 72 = 540pt
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=45,
    )

    styles = getSampleStyleSheet()

    # Custom Typography Styles
    brand_title_style = ParagraphStyle(
        "BrandTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=15,
        textColor=colors.white,
        leading=18,
    )
    brand_sub_style = ParagraphStyle(
        "BrandSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        textColor=colors.HexColor("#94A3B8"),
        leading=12,
    )
    brand_right_style = ParagraphStyle(
        "BrandRight",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        textColor=colors.HexColor("#818CF8"),
        alignment=2,  # Right aligned
        leading=13,
    )
    brand_date_style = ParagraphStyle(
        "BrandDate",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=colors.HexColor("#94A3B8"),
        alignment=2,  # Right aligned
        leading=11,
    )

    section_heading_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=0,
        spaceAfter=0,
        leading=14,
    )

    meta_label_style = ParagraphStyle(
        "MetaLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=colors.HexColor("#475569"),
        leading=11,
    )
    meta_val_style = ParagraphStyle(
        "MetaVal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        textColor=colors.HexColor("#0F172A"),
        leading=11,
    )

    kpi_number_style = ParagraphStyle(
        "KPINumber",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=16,
        alignment=1,  # Centered
        leading=18,
    )
    kpi_label_style = ParagraphStyle(
        "KPILabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7,
        alignment=1,  # Centered
        textColor=colors.HexColor("#64748B"),
        leading=9,
    )

    tbl_header_style = ParagraphStyle(
        "TblHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        textColor=colors.white,
        alignment=1,  # Centered
        leading=10,
    )
    tbl_cell_style = ParagraphStyle(
        "TblCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=colors.HexColor("#1E293B"),
        alignment=1,  # Centered
        leading=10,
    )
    tbl_cell_left_style = ParagraphStyle(
        "TblCellLeft",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=colors.HexColor("#1E293B"),
        leading=10,
    )

    story = []

    # Current Timestamps
    now = datetime.now(timezone.utc)
    generated_time_full = now.strftime("%A, %B %d, %Y • %I:%M %p UTC")
    generated_time_short = now.strftime("%b %d, %Y %H:%M UTC")

    # Sprint Schedule Timestamps
    start_dt = sprint.actual_start_date or sprint.start_date
    end_dt = sprint.completed_at or sprint.end_date
    start_str = start_dt.strftime("%b %d, %Y") if start_dt else "N/A"
    end_str = end_dt.strftime("%b %d, %Y") if end_dt else "N/A"

    # Status & Health Badges (Text and Colors)
    status_str = sprint.status.value.upper()
    health_str = (analytics.sprint_health or "ON_TRACK").replace("_", " ").upper()
    health_color = (
        colors.HexColor("#10B981") if "ON" in health_str
        else colors.HexColor("#F59E0B") if "RISK" in health_str
        else colors.HexColor("#EF4444")
    )

    # -------------------------------------------------------------------------
    # 1. TOP BRANDED HEADER BANNER
    # -------------------------------------------------------------------------
    header_data = [
        [
            Paragraph("<b>BUGTRACKER</b>", brand_title_style),
            Paragraph("AGILE SPRINT REPORT", brand_right_style),
        ],
        [
            Paragraph("Sprint Execution & Velocity Performance Report", brand_sub_style),
            Paragraph(f"Generated: {generated_time_short}", brand_date_style),
        ],
    ]
    header_table = Table(header_data, colWidths=[340, 200])
    header_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0F172A")),
            ("TOPPADDING", (0, 0), (-1, 0), 10),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
            ("RIGHTPADDING", (0, 0), (-1, -1), 14),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])
    )
    story.append(header_table)
    story.append(Spacer(1, 12))

    # -------------------------------------------------------------------------
    # 2. SPRINT METADATA & EXECUTIVE SUMMARY CARD
    # -------------------------------------------------------------------------
    user_name = generated_by.full_name if generated_by else "Admin / System"
    user_role = getattr(generated_by, "role", "ADMIN")

    meta_table_data = [
        [
            Paragraph("Sprint Name:", meta_label_style),
            Paragraph(f"<b>{sprint.name}</b>", meta_val_style),
            Paragraph("Sprint Timeline:", meta_label_style),
            Paragraph(f"{start_str} ➔ {end_str}", meta_val_style),
        ],
        [
            Paragraph("Current Status:", meta_label_style),
            Paragraph(f"<b>{status_str}</b>", meta_val_style),
            Paragraph("Sprint Health:", meta_label_style),
            Paragraph(f"<b><font color='{health_color.hexval()}'>{health_str}</font></b>", meta_val_style),
        ],
        [
            Paragraph("Report Date & Time:", meta_label_style),
            Paragraph(generated_time_full, meta_val_style),
            Paragraph("Generated By:", meta_label_style),
            Paragraph(f"{user_name} ({user_role})", meta_val_style),
        ],
    ]

    meta_table = Table(meta_table_data, colWidths=[95, 175, 95, 175])
    meta_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#E2E8F0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#F1F5F9")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])
    )
    story.append(meta_table)
    story.append(Spacer(1, 8))

    # Sprint Goal Callout Box
    if sprint.goal:
        goal_data = [[
            Paragraph("<b>🎯 Sprint Goal:</b>", meta_label_style),
            Paragraph(f"<i>{sprint.goal}</i>", meta_val_style),
        ]]
        goal_table = Table(goal_data, colWidths=[80, 460])
        goal_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EEF2FF")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#C7D2FE")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ])
        )
        story.append(goal_table)
        story.append(Spacer(1, 8))

    # Overdue Alert Banner if applicable
    if analytics.is_overdue:
        overdue_data = [[
            Paragraph(
                f"<b>⚠️ OVERDUE SPRINT ALERT:</b> This sprint is currently overdue by <b>{analytics.days_overdue} days</b>. Please review unresolved blockers.",
                ParagraphStyle("Overdue", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5, textColor=colors.HexColor("#991B1B")),
            )
        ]]
        overdue_table = Table(overdue_data, colWidths=[540])
        overdue_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF2F2")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#FCA5A5")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ])
        )
        story.append(overdue_table)
        story.append(Spacer(1, 8))

    story.append(Spacer(1, 6))

    # -------------------------------------------------------------------------
    # 3. KEY PERFORMANCE INDICATORS (KPI METRIC CARDS)
    # -------------------------------------------------------------------------
    story.append(Paragraph("<b>Key Sprint Metrics</b>", section_heading_style))
    story.append(Spacer(1, 6))

    comp_rate = f"{analytics.completion_rate}%"
    planned_cap_hours = (
        sprint.estimated_team_members * sprint.working_days * sprint.hours_per_day
        if (sprint.estimated_team_members and sprint.working_days and sprint.hours_per_day)
        else None
    )
    cap_display = f"{planned_cap_hours} hrs" if planned_cap_hours else "Not set"

    kpi_data = [
        [
            Paragraph(str(analytics.total_issues), ParagraphStyle("K1", parent=kpi_number_style, textColor=colors.HexColor("#0F172A"))),
            Paragraph(str(analytics.completed_issues), ParagraphStyle("K2", parent=kpi_number_style, textColor=colors.HexColor("#10B981"))),
            Paragraph(str(analytics.in_progress_issues), ParagraphStyle("K3", parent=kpi_number_style, textColor=colors.HexColor("#4F46E5"))),
            Paragraph(str(analytics.open_issues), ParagraphStyle("K4", parent=kpi_number_style, textColor=colors.HexColor("#F59E0B"))),
            Paragraph(comp_rate, ParagraphStyle("K5", parent=kpi_number_style, textColor=colors.HexColor("#4F46E5"))),
            Paragraph(cap_display, ParagraphStyle("K6", parent=kpi_number_style, fontSize=12, textColor=colors.HexColor("#0F172A"))),
        ],
        [
            Paragraph("TOTAL TICKETS", kpi_label_style),
            Paragraph("COMPLETED", kpi_label_style),
            Paragraph("IN PROGRESS", kpi_label_style),
            Paragraph("OPEN / BACKLOG", kpi_label_style),
            Paragraph("COMPLETION RATE", kpi_label_style),
            Paragraph("PLANNED CAPACITY", kpi_label_style),
        ],
    ]

    # 6 columns: 90pt each = 540pt total
    kpi_table = Table(kpi_data, colWidths=[90, 90, 90, 90, 90, 90])
    kpi_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFFFFF")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#E2E8F0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("TOPPADDING", (0, 0), (-1, 0), 8),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
            ("TOPPADDING", (0, 1), (-1, 1), 2),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 6),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ])
    )
    story.append(kpi_table)
    story.append(Spacer(1, 14))

    # -------------------------------------------------------------------------
    # 4. ISSUE STATUS BREAKDOWN TABLE
    # -------------------------------------------------------------------------
    story.append(Paragraph("<b>Defect & Issue Status Breakdown</b>", section_heading_style))
    story.append(Spacer(1, 6))

    total = analytics.total_issues or 1  # prevent div by zero
    stat_rows = [
        [
            Paragraph("Status Category", tbl_header_style),
            Paragraph("Tickets Count", tbl_header_style),
            Paragraph("Share of Scope", tbl_header_style),
            Paragraph("Resolution Status", tbl_header_style),
        ],
        [
            Paragraph("<b>Completed / Resolved</b>", tbl_cell_left_style),
            Paragraph(str(analytics.completed_issues), tbl_cell_style),
            Paragraph(f"{round((analytics.completed_issues / total) * 100, 1)}%", tbl_cell_style),
            Paragraph("<font color='#10B981'><b>Resolved & Verified</b></font>", tbl_cell_style),
        ],
        [
            Paragraph("<b>In Progress / Review / Testing</b>", tbl_cell_left_style),
            Paragraph(str(analytics.in_progress_issues), tbl_cell_style),
            Paragraph(f"{round((analytics.in_progress_issues / total) * 100, 1)}%", tbl_cell_style),
            Paragraph("<font color='#4F46E5'><b>Active Investigation</b></font>", tbl_cell_style),
        ],
        [
            Paragraph("<b>Open / Pending Assignment</b>", tbl_cell_left_style),
            Paragraph(str(analytics.open_issues), tbl_cell_style),
            Paragraph(f"{round((analytics.open_issues / total) * 100, 1)}%", tbl_cell_style),
            Paragraph("<font color='#F59E0B'><b>Awaiting Action</b></font>", tbl_cell_style),
        ],
        [
            Paragraph("<b>Total Sprint Scope</b>", ParagraphStyle("TB", parent=tbl_cell_left_style, fontName="Helvetica-Bold")),
            Paragraph(f"<b>{analytics.total_issues}</b>", ParagraphStyle("TB2", parent=tbl_cell_style, fontName="Helvetica-Bold")),
            Paragraph("<b>100.0%</b>", ParagraphStyle("TB3", parent=tbl_cell_style, fontName="Helvetica-Bold")),
            Paragraph(f"<b>{analytics.completion_rate}% Delivered</b>", ParagraphStyle("TB4", parent=tbl_cell_style, fontName="Helvetica-Bold")),
        ],
    ]

    stat_table = Table(stat_rows, colWidths=[180, 100, 110, 150])
    stat_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4F46E5")),
            ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#FFFFFF")),
            ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#F8FAFC")),
            ("BACKGROUND", (0, 3), (-1, 3), colors.HexColor("#FFFFFF")),
            ("BACKGROUND", (0, 4), (-1, 4), colors.HexColor("#EEF2FF")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#E2E8F0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (0, -1), 10),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])
    )
    story.append(stat_table)
    story.append(Spacer(1, 14))

    # -------------------------------------------------------------------------
    # 5. TEAM WORKLOAD ALLOCATION
    # -------------------------------------------------------------------------
    story.append(Paragraph("<b>Team Workload & Developer Distribution</b>", section_heading_style))
    story.append(Spacer(1, 6))

    if analytics.workload and len(analytics.workload) > 0:
        wl_headers = [
            Paragraph("Team Member / Developer", tbl_header_style),
            Paragraph("Assigned", tbl_header_style),
            Paragraph("Completed", tbl_header_style),
            Paragraph("In Progress", tbl_header_style),
            Paragraph("Open", tbl_header_style),
            Paragraph("Completion Rate", tbl_header_style),
        ]
        wl_rows = [wl_headers]

        for i, wl in enumerate(analytics.workload):
            assigned = wl["assigned_issues"]
            done = wl["completed_issues"]
            rate = f"{round((done / assigned) * 100, 1)}%" if assigned > 0 else "0.0%"
            row_bg = colors.HexColor("#FFFFFF") if i % 2 == 0 else colors.HexColor("#F8FAFC")

            wl_rows.append([
                Paragraph(f"<b>{wl['developer_name']}</b>", tbl_cell_left_style),
                Paragraph(str(assigned), tbl_cell_style),
                Paragraph(f"<font color='#10B981'><b>{done}</b></font>", tbl_cell_style),
                Paragraph(str(wl["in_progress_issues"]), tbl_cell_style),
                Paragraph(str(wl["open_issues"]), tbl_cell_style),
                Paragraph(rate, tbl_cell_style),
            ])

        wl_table = Table(wl_rows, colWidths=[170, 70, 75, 75, 70, 80])
        wl_style_commands = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#E2E8F0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (0, -1), 10),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
        # Alternating rows
        for i in range(1, len(wl_rows)):
            bg = colors.HexColor("#FFFFFF") if i % 2 == 1 else colors.HexColor("#F8FAFC")
            wl_style_commands.append(("BACKGROUND", (0, i), (-1, i), bg))

        wl_table.setStyle(TableStyle(wl_style_commands))
        story.append(wl_table)
    else:
        empty_wl_data = [[
            Paragraph(
                "<i>No team workload recorded. There are currently no issues assigned to developers within this sprint.</i>",
                ParagraphStyle("EmptyWL", parent=styles["Normal"], fontName="Helvetica-Oblique", fontSize=8.5, textColor=colors.HexColor("#64748B")),
            )
        ]]
        empty_table = Table(empty_wl_data, colWidths=[540])
        empty_table.setStyle(
            TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#E2E8F0")),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ])
        )
        story.append(empty_table)

    # Build Document using NumberedCanvas for dynamic page numbers and footer
    doc.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer
