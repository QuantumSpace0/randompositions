/**
 * --- CONFIGURATION SECTION ---
 * 1. Paste your IDs inside the single quotes below.
 * 2. Ensure there are NO spaces around the IDs.
 */
const SPREADSHEET_ID = '1Ph5s4sHIIRI0zP9Q4A8LRjbERu7ithmke8h8PKAfzKQ'; 
const FOLDER_ID_G    = '14s8aJ_SzyU4MSD-Gg_CbrxelLM0wZTcV';
const FOLDER_ID_OHM  = '18xMOQhA-kkP2FtO0C-asU3Og-TnCD6z9';
const FOLDER_ID_OHR  = '1glrttlvA7ky1ONuoyFkveiIXNtYUO7m3';
const FOLDER_ID_MHM  = '1pWn_1rDcRtNzHH7Kxv6uKZLGbolchOIl'; // NEW
const FOLDER_ID_MHR  = '17nPH67lp8H4pv5K-vLNQmweb0rf0RblP'; // NEW

const FOLDER_MAP = {
  'G': FOLDER_ID_G,
  'OHm': FOLDER_ID_OHM,
  'OHr': FOLDER_ID_OHR,
  'MHm': FOLDER_ID_MHM,
  'MHr': FOLDER_ID_MHR
};

// --- API ENTRY POINT ---
function doGet(e) {
  return ContentService.createTextOutput("Quantum Space API is Online. Please use POST.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch(err) {
    return sendJSON({ success: false, error: "Invalid JSON format" });
  }

  var action = data.action;
  var response = { success: false, error: "Unknown action" };

  try {
    if (action === 'login') {
      response = doLogin(data.username, data.password);
    } else if (action === 'getUnseenImage') {
      response = getUnseenImage(data.username);
    } else if (action === 'logErrorAndSkip') {
      logErrorAndSkip(data.username, data.imageId);
      response = { success: true };
    } else if (action === 'upload') {
      response = uploadFileToDrive(data);
    } else if (action === 'changePassword') {
      response = changePassword(data.username, data.newPassword);
    }
  } catch (error) {
    response = { success: false, error: error.toString() };
  }

  return sendJSON(response);
}

function sendJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- CORE LOGIC ---

function getDatabase() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.includes('YOUR_SPREADSHEET_ID')) {
    throw new Error("SETUP ERROR: IDs not set in Code.gs");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function doLogin(username, password) {
  const ss = getDatabase(); 
  const sheet = ss.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(username).toLowerCase() && 
        String(data[i][1]) === String(password)) {
      logLogin(username); 
      // Return password too so user can see it in profile
      return { success: true, role: data[i][2], username: data[i][0], password: data[i][1] };
    }
  }
  return { success: false, error: "Invalid Credentials" };
}

function changePassword(username, newPassword) {
  const ss = getDatabase();
  const sheet = ss.getSheetByName('Users');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(username).toLowerCase()) {
      // Set new password in Column B (index 1 + 1 for 1-based row)
      sheet.getRange(i + 1, 2).setValue(newPassword);
      return { success: true };
    }
  }
  return { success: false, error: "User not found" };
}

function logLogin(username) {
  try {
    const ss = getDatabase();
    const sheet = ss.getSheetByName('Logs');
    const now = new Date();
    sheet.appendRow([username, now.toLocaleDateString(), now.toLocaleTimeString()]);
  } catch(e) {}
}

function getUnseenImage(username) {
  const ss = getDatabase();
  const imgSheet = ss.getSheetByName('Images');
  const seenSheet = ss.getSheetByName('SeenHistory');
  const userSheet = ss.getSheetByName('Users');
  
  // 1. DETERMINE USER ROLE
  const userData = userSheet.getDataRange().getValues();
  let userRole = "";
  for(let i=1; i<userData.length; i++) {
    if(String(userData[i][0]).toLowerCase() === String(username).toLowerCase()) {
      userRole = userData[i][2];
      break;
    }
  }

  // 2. DEFINE ALLOWED FOLDERS BASED ON ROLE
  let allowedFolders = [];
  if (userRole === 'InterCo') {
    allowedFolders = ['G', 'OHm', 'OHr'];
  } else if (userRole === 'MHm') {
    allowedFolders = ['MHm'];
  } else if (userRole === 'MHr') {
    allowedFolders = ['MHr'];
  } else if (userRole === 'Admin') {
    // Admin sees everything
    allowedFolders = ['G', 'OHm', 'OHr', 'MHm', 'MHr'];
  } else {
    // Default fallback or error
    return { error: "User Role '" + userRole + "' has no folder access configured." };
  }

  // 3. GET IMAGES
  const allImagesRaw = imgSheet.getDataRange().getValues().slice(1);
  if (allImagesRaw.length === 0) return { error: "No images in database." };

  // Filter images by allowed folders (Column E is Subfolder, index 4)
  const allImages = allImagesRaw.filter(row => allowedFolders.includes(row[4]));

  if (allImages.length === 0) return { error: "No images found for your role (" + userRole + ")." };

  // 4. FREQUENCY LOGIC (Same as before)
  const seenData = seenSheet.getDataRange().getValues();
  const imageMap = {};
  allImages.forEach(row => imageMap[row[0]] = row);
  const allImageIds = Object.keys(imageMap);

  const viewCounts = {};
  allImageIds.forEach(id => viewCounts[id] = 0);
  
  seenData.forEach(row => {
    if (String(row[0]).toLowerCase() === String(username).toLowerCase()) {
      const id = row[1];
      if (viewCounts[id] !== undefined) viewCounts[id]++;
    }
  });

  let minCount = Infinity;
  for (const id in viewCounts) {
    if (viewCounts[id] < minCount) minCount = viewCounts[id];
  }

  const candidates = allImageIds.filter(id => viewCounts[id] === minCount);
  const randomId = candidates[Math.floor(Math.random() * candidates.length)];
  const selectedImage = imageMap[randomId];
  const imageDriveId = selectedImage[3]; 

  let base64Image = "";
  try {
    const file = DriveApp.getFileById(imageDriveId);
    const blob = file.getBlob();
    const b64 = Utilities.base64Encode(blob.getBytes());
    base64Image = "data:" + blob.getContentType() + ";base64," + b64;
  } catch(e) {
    return { error: "Image processing failed: " + e.message };
  }

  const now = new Date();
  seenSheet.appendRow([
    username, selectedImage[0], selectedImage[1], 
    now.toLocaleDateString(), now.toLocaleTimeString()
  ]);

  return {
    success: true,
    id: selectedImage[0],
    name: selectedImage[1],
    desc: selectedImage[2],
    image: base64Image
  };
}

function logErrorAndSkip(username, imageId) {
  const ss = getDatabase();
  const seenSheet = ss.getSheetByName('SeenHistory');
  const now = new Date();
  seenSheet.appendRow([username, imageId, "BROKEN - SKIPPED", now.toLocaleDateString(), now.toLocaleTimeString()]);
}

function uploadFileToDrive(data) {
  if (!FOLDER_MAP[data.folderType]) return { success: false, error: "Invalid Folder" };

  try {
    const folder = DriveApp.getFolderById(FOLDER_MAP[data.folderType]);
    const decoded = Utilities.base64Decode(data.fileData);
    const blob = Utilities.newBlob(decoded, data.mimeType, data.fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const ss = getDatabase();
    const sheet = ss.getSheetByName('Images');
    sheet.appendRow([Utilities.getUuid(), data.name, data.desc || "", file.getId(), data.folderType, new Date()]);
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
