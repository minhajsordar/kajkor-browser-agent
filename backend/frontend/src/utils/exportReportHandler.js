import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
// // For A4 download
// exportReport(dataList, 'download', { printerType: 'standard', format: 'a4' });

// // For Mini POS receipt printer (58mm)
// exportReport(dataList, 'receipt', { printerType: 'mini-pos', format: '58mm' });

// // For Direct Print on Mini POS printer (80mm)
// exportReport(dataList, 'print', { printerType: 'mini-pos', format: '80mm' });

export async function exportPosReport(dataList, exportType, printOptions = {}) {
  // console.log("Exporting:", dataList, exportType);

  const {
    printerType = "standard", // Options: 'standard', 'mini-pos', 'pdf'
    orientation = "portrait", // Default for PDF; Mini POS usually has fixed orientation
    format = "a4", // Default for PDF; change to '58mm' or '80mm' for mini POS
    title = "Payment Receipt",
    fontSize = 10,
    unit = "mm",
  } = printOptions;

  let doc;
  let pageWidth, startY;

  // Configure PDF based on printer type
  if (printerType === "mini-pos") {
    // Mini POS printer (typically 58mm or 80mm width)
    pageWidth = format === "80mm" ? 80 : 58;
    doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [pageWidth, 297],
    });
    startY = 10;
    doc.setFontSize(12); // Slightly larger for receipt readability on mini printers
  } else {
    // Standard Printer or PDF (A4 or Letter)
    doc = new jsPDF({ orientation, unit, format });
    pageWidth = doc.internal.pageSize.getWidth();
    startY = 20;
    doc.setFontSize(18);
  }

  if (siteSettingStore.posHeaderImageBase64) {
    const logoWidth =
      siteSettingStore.siteSettings.pos_header_image_width || 20; // Width of the logo in mm
    const logoHeight =
      siteSettingStore.siteSettings.pos_header_image_height || 20; // Height of the logo in mm
    const logoX = (pageWidth - logoWidth) / 2; // Centered horizontally
    doc.addImage(
      siteSettingStore.posHeaderImageBase64,
      "PNG",
      logoX,
      10,
      logoWidth,
      logoHeight
    );

    // Adjust startY position after the logo
    startY += logoHeight + 1;
  }
  const headerList = [];
  if (siteSettingStore.siteSettings.pos_header) {
    for (const elementIndex in siteSettingStore.siteSettings.pos_header) {
      const element = siteSettingStore.siteSettings.pos_header;
    }
  }
  if (siteSettingStore.siteSettings.pos_footer) {
  }

  // Add title below the logo

  autoTable(doc, {
    body: [...siteSettingStore.siteSettings.pos_header.map((e) => [e])],
    styles: { fontSize, cellPadding: 1 },
    columnStyles: {
      0: { halign: "center" },
    },
    theme: printerType === "mini-pos" ? "plain" : "grid",
    margin: {
      left: 5,
      right: 5,
      top: startY,
    },
  });
  // Prepare table data
  const body = dataList.products.map((item) => [
    item.name,
    `${item.price} x ${item.quantity} = ${item.price * item.quantity}`,
  ]);

  // Configure product table styles based on printer type
  autoTable(doc, {
    body: body,
    styles: { fontSize, cellPadding: 1 },
    // startY: startY + 10,
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "right" },
    },
    theme: printerType === "mini-pos" ? "plain" : "grid", // Minimalist for mini-pos
    didDrawPage: printerType === "mini-pos" ? adjustForMiniPos : null,
    margin: {
      left: 5,
      right: 5,
    },
  });

  // Prepare summary table data
  const summaryBody = [
    [
      "Sub Total",
      dataList.products.reduce((a, c) => c.price * c.quantity + a, 0),
    ],
    ["Discount", dataList.discount],
    ["Grand Total", dataList.totalAmount],
    ["contact Paid Amount", dataList.paidAmount],
    ["Due Amount", dataList.dueAmount],
  ];

  autoTable(doc, {
    body: summaryBody,
    styles: { fontSize, cellPadding: 1 },
    // startY: doc.previousAutoTable.finalY + 10, // Position summary table below product table
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "right" },
    },
    theme: printerType === "mini-pos" ? "plain" : "grid",
    didDrawPage: printerType === "mini-pos" ? adjustForMiniPos : null,
    margin: {
      left: 5,
      right: 5,
    },
  });

  autoTable(doc, {
    body: [...siteSettingStore.siteSettings.pos_footer.map((e) => [e])],
    styles: { fontSize, cellPadding: 1 },
    columnStyles: {
      0: { halign: "center" },
    },
    theme: printerType === "mini-pos" ? "plain" : "grid",
    margin: {
      left: 5,
      right: 5,
    },
  });

  // Adjust page for mini POS printer
  function adjustForMiniPos(data) {
    const { doc, cursor } = data;
    doc.setDrawColor(0);
    doc.line(5, cursor.y + 2, pageWidth - 5, cursor.y + 2); // Footer line
  }

  // Export based on exportType

  const pdfFrame = document.getElementById("pdfFrame");
  receiptDialog.value = true;
  if (exportType === "download") {
    doc.save(`${title.replace(/\s+/g, "_")}.pdf`);
  } else if (exportType === "print") {
    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const newWindow = window.open(pdfUrl);
    newWindow.onload = () => {
      newWindow.print();
      URL.revokeObjectURL(pdfUrl);
    };
  } else if (exportType === "receipt") {
    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);
    pdfFrame.src = pdfUrl;
    // Optionally, add a print button to print the PDF
    document.getElementById("printButton").onclick = () => {
      pdfFrame.contentWindow.print();
    };

    // Clean up the object URL when it's no longer needed
    pdfFrame.onload = () => {
      URL.revokeObjectURL(pdfUrl);
    };
    // const receiptWindow = window.open(pdfUrl, 'Receipt', `width=${pageWidth + 20},height=600`);
    // receiptWindow.onload = () => {
    //   receiptWindow.print();
    //   URL.revokeObjectURL(pdfUrl);
    // };
  } else {
    const pdfBlob = doc.output("blob");
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl);
  }
}
