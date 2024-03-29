/**
 * @OnlyCurrentDoc Limits the script to only accessing the current sheet.
 */

/**
 * A special function that runs when the spreadsheet is open, used to add a
 * custom menu to the spreadsheet.
 */
function onOpen() {
  var spreadsheet = SpreadsheetApp.getActive();
  var menuItems = [
    {name: 'Prepare sheet...', functionName: 'prepareSheet_'},
    {name: 'Generate step-by-step...', functionName: 'generateStepByStep_'}
  ];
  spreadsheet.addMenu('Directions', menuItems);
}

/**
 * A custom function that converts meters to miles.
 *
 * @param {Number} meters The distance in meters.
 * @return {Number} The distance in miles.
 */
function metersToMiles(meters) {
  if (typeof meters != 'number') {
    return null;
  }
  return meters / 1000 * 0.621371;
}

/**
 * A function that adds headers and some initial data to the spreadsheet.
 */
function prepareSheet_() {
  var sheet1 = SpreadsheetApp.getActiveSheet().setName('Settings');
  var headers1 = [
    'Start Address',
    'End Address',
    'Driving Distance (meters)',
    'Driving Distance (miles)'];
  var initialData = [
    '350 5th Ave, New York, NY 10118',
    '405 Lexington Ave, New York, NY 10174'];
  sheet1.getRange('A1:D1').setValues([headers1]).setFontWeight('bold');
  sheet1.getRange('A2:B2').setValues([initialData]);
  sheet1.setFrozenRows(1);
  sheet1.autoResizeColumns(1, 4);
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.insertSheet('RunTime');
  var sheet2 = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('RunTime');
  var headers2 = ['Script Finish Time', 'Script Run Time (mil-sec)'];
  sheet2.getRange(1, 1, 1, 2).setValues([headers2]).setFontWeight('bold');
  sheet2.setFrozenRows(1);
  sheet2.autoResizeColumns(1, 2);
}

/**
 * Creates a new sheet containing step-by-step directions between the two
 * addresses on the "Settings" sheet that the user selected.
 */
function generateStepByStep_() 
{

  //---------- Start counting execution time
  var runtimeCountStart = new Date();
  
  var spreadsheet = SpreadsheetApp.getActive();
  var settingsSheet = spreadsheet.getSheetByName('Settings');
  settingsSheet.activate();
  // Prompt the user for a row number.
  var selectedRow = Browser.inputBox('Generate step-by-step',
      'Please enter the row number of the addresses to use' +
      ' (for example, "2"):',
      Browser.Buttons.OK_CANCEL);
  if (selectedRow == 'cancel') {return;}
  var rowNumber = Number(selectedRow);
  if (isNaN(rowNumber) || rowNumber < 2 || rowNumber > settingsSheet.getLastRow()) 
  {
    Browser.msgBox('Error',
        Utilities.formatString('Row "%s" is not valid.', selectedRow),
        Browser.Buttons.OK);
    return;
  }
  // Retrieve the addresses in that row.
  var row = settingsSheet.getRange(rowNumber, 1, 1, 2);
  var rowValues = row.getValues();
  var origin = rowValues[0][0];
  var destination = rowValues[0][1];
  if (!origin || !destination) 
  {
    Browser.msgBox('Error', 'Row does not contain two addresses.',
        Browser.Buttons.OK);
    return;
  }

  // Get the raw directions information.
  var directions = getDirections_(origin, destination);

  // Create a new sheet and append the steps in the directions.
  var sheetName = 'Driving Directions for Row ' + rowNumber;
  var directionsSheet = spreadsheet.getSheetByName(sheetName);
  if (directionsSheet) 
  {
    directionsSheet.clear();
    directionsSheet.activate();
  } 
  else 
  {
        directionsSheet = spreadsheet.insertSheet(sheetName, spreadsheet.getNumSheets());
  }
  var sheetTitle = Utilities.formatString('Driving Directions from %s to %s',
      origin, destination);
  var headers = [[sheetTitle, '', ''],['Step', 'Distance (Meters)', 'Distance (Miles)']];
  var newRows = [];
  for (var i = 0; i < directions.routes[0].legs[0].steps.length; i++) 
  {
    var step = directions.routes[0].legs[0].steps[i];
    // Remove HTML tags from the instructions.
    var instructions = step.html_instructions.replace(/<br>|<div.*?>/g, '\n')
        .replace(/<.*?>/g, '');
    newRows.push([instructions,step.distance.value]);
  }
  directionsSheet.getRange(1, 1, headers.length, 3).setValues(headers);
  directionsSheet.getRange(headers.length + 1, 1, newRows.length, 2).setValues(newRows);
  directionsSheet.getRange(headers.length + 1, 3, newRows.length, 1).setFormulaR1C1('=METERSTOMILES(R[0]C[-1])');

  // Format the new sheet.
  directionsSheet.getRange('A1:C1').merge().setBackground('#ddddee');
  directionsSheet.getRange('A1:2').setFontWeight('bold');
  directionsSheet.setColumnWidth(1, 500);
  directionsSheet.getRange('B2:C').setVerticalAlignment('top');
  directionsSheet.getRange('C2:C').setNumberFormat('0.00');
  var stepsRange = directionsSheet.getDataRange()
      .offset(2, 0, directionsSheet.getLastRow() - 2);
  setAlternatingRowBackgroundColors_(stepsRange, '#ffffff', '#eeeeee');
  directionsSheet.setFrozenRows(2);
  SpreadsheetApp.flush();
  
  //-----Stop counting execution time
  runtimeCountStop(runtimeCountStart);
  recordRuntime();
}

/**
 * Sets the background colors for alternating rows within the range.
 * @param {Range} range The range to change the background colors of.
 * @param {string} oddColor The color to apply to odd rows (relative to the
 *     start of the range).
 * @param {string} evenColor The color to apply to even rows (relative to the
 *     start of the range).
 */
function setAlternatingRowBackgroundColors_(range, oddColor, evenColor) {
  var backgrounds = [];
  for (var row = 1; row <= range.getNumRows(); row++) {
    var rowBackgrounds = [];
    for (var column = 1; column <= range.getNumColumns(); column++) {
      if (row % 2 == 0) {
        rowBackgrounds.push(evenColor);
      } else {
        rowBackgrounds.push(oddColor);
      }
    }
    backgrounds.push(rowBackgrounds);
  }
  range.setBackgrounds(backgrounds);
}

/**
 * A shared helper function used to obtain the full set of directions
 * information between two addresses. Uses the Apps Script Maps Service.
 *
 * @param {String} origin The starting address.
 * @param {String} destination The ending address.
 * @return {Object} The directions response object.
 */
function getDirections_(origin, destination) {
  var directionFinder = Maps.newDirectionFinder();
  directionFinder.setOrigin(origin);
  directionFinder.setDestination(destination);
  var directions = directionFinder.getDirections();
  if (directions.status !== 'OK') {
    throw directions.error_message;
  }
  return directions;
}

/**
* This function sets the new execution time as the 'runtimeCount' script property.
*/
	
function runtimeCountStop(start) {

  var props = PropertiesService.getScriptProperties();
  var currentRuntime = props.getProperty("runtimeCount");
  var stop = new Date();
  var newRuntime = Number(stop) - Number(start) + Number(currentRuntime);
  var setRuntime = {
    runtimeCount: newRuntime,
  }
  props.setProperties(setRuntime);

}

/**
* Here's how you can record the project's total execution time in a sheet.
* Set a daily time-based trigger for this function.
* After being recorder in the sheet, the property is being reset.
*/

function recordRuntime() {

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("RunTime");
  var props = PropertiesService.getScriptProperties();
  var runtimeCount = props.getProperty("runtimeCount");
  var recordTime = new Date();
  sheet.appendRow([recordTime, runtimeCount]);
  props.deleteProperty("runtimeCount");

}
