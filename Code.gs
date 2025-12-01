/**
 * --- CONFIGURATION SECTION ---
 * 1. Paste your IDs inside the single quotes below.
 * 2. Ensure there are NO spaces around the IDs.
 */
const SPREADSHEET_ID = '1Ph5s4sHIIRI0zP9Q4A8LRjbERu7ithmke8h8PKAfzKQ'; 
const FOLDER_ID_G    = '14s8aJ_SzyU4MSD-Gg_CbrxelLM0wZTcV';
const FOLDER_ID_OHM  = '18xMOQhA-kkP2FtO0C-asU3Og-TnCD6z9';
const FOLDER_ID_OHR  = '1glrttlvA7ky1ONuoyFkveiIXNtYUO7m3';

const FOLDER_MAP = {
  'G': FOLDER_ID_G,
  'OHm': FOLDER_ID_OHM,
  'OHr': FOLDER_ID_OHR
};

// --- HELPER: SAFE DATABASE CONNECTION ---
function getDatabase() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.includes('YOUR_SPREADSHEET_ID')) {
    throw new Error("SETUP ERROR: You have not replaced 'YOUR_SPREADSHEET_ID_HERE' with your actual Sheet ID in Code.gs!");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

// --- BOILERPLATE ---
function doGet() {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('Quantum Space')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- AUTHENTICATION ---
function doLogin(username, password) {
  const ss = getDatabase(); 
  const sheet = ss.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(username).toLowerCase() && 
        String(data[i][1]) === String(password)) {
      logLogin(username); 
      return { success: true, role: data[i][2], username: data[i][0] };
    }
  }
  return { success: false };
}

function logLogin(username) {
  try {
    const ss = getDatabase();
    const sheet = ss.getSheetByName('Logs');
    const now = new Date();
    sheet.appendRow([username, now.toLocaleDateString(), now.toLocaleTimeString()]);
  } catch(e) {}
}

// --- IMAGE LOGIC (PERMANENT HISTORY) ---
function getUnseenImage(username) {
  const ss = getDatabase();
  const imgSheet = ss.getSheetByName('Images');
  const seenSheet = ss.getSheetByName('SeenHistory');
  
  // 1. Get All Valid Images from Database
  const allImagesData = imgSheet.getDataRange().getValues().slice(1); // Remove header
  if (allImagesData.length === 0) return { error: "No images in database." };
  
  // Create a map for easy lookup: { ImageID: RowData }
  const imageMap = {};
  allImagesData.forEach(row => {
    imageMap[row[0]] = row; // row[0] is ImageID
  });
  const allImageIds = Object.keys(imageMap);

  // 2. Analyze User History
  const seenData = seenSheet.getDataRange().getValues();
  
  // Initialize counts for every available image to 0
  const viewCounts = {};
  allImageIds.forEach(id => viewCounts[id] = 0);
  
  // Count how many times user has seen each image
  seenData.forEach(row => {
    // Check if this row belongs to the current user
    if (String(row[0]).toLowerCase() === String(username).toLowerCase()) {
      const id = row[1];
      // Only count if the image still exists in our database
      if (viewCounts[id] !== undefined) {
        viewCounts[id]++;
      }
    }
  });

  // 3. Find the "Least Seen" Count
  // Example: If user has seen Image A twice and Image B once, minCount is 1.
  let minCount = Infinity;
  for (const id in viewCounts) {
    if (viewCounts[id] < minCount) {
      minCount = viewCounts[id];
    }
  }

  // 4. Filter images that match the minimum count
  // This ensures we cycle through ALL images before showing repeats.
  const candidates = allImageIds.filter(id => viewCounts[id] === minCount);

  // 5. Pick Random from Candidates
  const randomId = candidates[Math.floor(Math.random() * candidates.length)];
  const selectedImage = imageMap[randomId];
  const imageDriveId = selectedImage[3]; 

  // --- Convert Image to Base64 (Permissions Fix) ---
  let base64Image = "";
  try {
    const file = DriveApp.getFileById(imageDriveId);
    const blob = file.getBlob();
    const b64 = Utilities.base64Encode(blob.getBytes());
    base64Image = "data:" + blob.getContentType() + ";base64," + b64;
  } catch(e) {
    return { error: "Failed to process image: " + e.message };
  }

  // 6. Log to SeenHistory (PERMANENT RECORD)
  // We append every time, never deleting.
  const now = new Date();
  seenSheet.appendRow([
    username, selectedImage[0], selectedImage[1], 
    now.toLocaleDateString(), now.toLocaleTimeString()
  ]);

  return {
    id: selectedImage[0],
    name: selectedImage[1],
    desc: selectedImage[2],
    image: base64Image
  };
}

// --- ADMIN UPLOAD ---
function uploadFileToDrive(data, name, desc, folderType) {
  if (!FOLDER_MAP[folderType] || FOLDER_MAP[folderType].includes('YOUR_FOLDER')) {
    return { success: false, error: "Configuration Error: IDs not set." };
  }
  try {
    const folder = DriveApp.getFolderById(FOLDER_MAP[folderType]);
    const decoded = Utilities.base64Decode(data.data);
    const blob = Utilities.newBlob(decoded, data.mimeType, data.fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const ss = getDatabase();
    const sheet = ss.getSheetByName('Images');
    sheet.appendRow([Utilities.getUuid(), name, desc || "", file.getId(), folderType, new Date()]);
    
    return { success: true };
  } catch (e) {
    return { success: false, error: "Upload Failed: " + e.message };
  }
}
