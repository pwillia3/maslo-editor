'use strict';

/**
 * Constructor for the manifest class
 * Creates a table representing all the content in 
 * the manifest
 * @param path The path to the manifest
 * @param name Name of the project
 * @param argObj Wheter the manifest is a quiz or project
 */
function Manifest(path, name, argObj, parent_manifest) {
	this.path = path;
	this.projectName = name;
	this.obj = argObj;
        this.parent_manifest = parent_manifest;

	this.ordernum = 0;
	this.tmpOrder = new Array();

	var data = null;
	if (this.obj != null) {
		data = this.obj.attachments;
		this.type = "quiz";
	}

	this.metadata = {};
	if (data == null) {
		var f = new FileCache(path + air.File.separator + 'manifest');
		data = f.val ? JSON.parse(f.val) : [];
		this.file = f;

                this.load_metadata();
	}

	var tableString = '\
		<table id="contentTable">                \
			<thead>                              \
				<tr>                             \
				    <th class="order">Order</th> \
					<th>Type</th>                \
					<th class="big title">Title</th>   ';
				if (this.obj == null)
					tableString += '<th class="big">Status</th>';
				tableString += '<th>Remove</th>              \
				</tr>                            \
			</thead>                             \
			<tbody class="proj">                 \
			</tbody>                             \
		</table>';
	this.tbl = $(tableString);
	this.confirm = $('\
		<div id="dialog-confirm" style="display: none" title="Delete Content"> \
			<p>This content will be permanently deleted and cannot be          \
			recovered. Are you sure?</p>                                       \
		</div>');
	this.edit = $('<div id="dialog-content" style="display: none" title="Edit Content"></div>');

        // When we don't have any rows to display we'll add a message to point the user in the right direction
	if (data.length == 0) {
            this.tbl.show();
            var tr = $('<tr id="fillRow"/>');
            this.tbl.find('tbody').append(tr);
            tr.append($('<td colspan="5" class="fill">Click "' + $("#addButton").text() + '" to start editing.</td>'));
	}
        else {
            // Add one row to the table for each item in data
            for(var i in data) {
                if (this.obj == null) {
                    var content = Content.FromMetadata(path, data[i]);
                    if (content.status == "Modified" || content.status == "Unpublished") {
                        this.updateStatus(false);
                    }
                    this.addContent(content, false);
                }
                else {
                    this.addContent(data[i], false);
                }
            }
        }
}


/**
 * Sets up the draggable table rows
 * updateIndexes() makes sure the input fields get updated on drop
 */
var fixHelper = function(e, ui) {
	ui.children().each(function() {
		$(this).width($(this).width());
	});
	return ui;
};
function updateIndexes(manifest){
	var input = manifest.obj ? $('#mediaDiv table tbody input') : $('#contentTable tbody input');
	input.each(function(i){
		$(this).val(i+1);
	});
}
/**
 * Renders the table and makes it sortable
 * @param div The manifest div
 */
Manifest.prototype.render = function(div) {
	div.append(this.tbl);
	var manifest = this;
	this.tbl.find('tbody').sortable({
		items: 'tr', axis: 'y', helper: fixHelper, 
		forceHelperSize: true,
		placeholder: 'tablespace',
        update: function(event, ui) { 
        	manifest.save();
        	updateIndexes(manifest); 
        }
	});
};

/**
 * Gets the a list of all the metadata in the manifest.
 * @param convert Boolean value
 */
Manifest.prototype.data = function(convert) {
	var basePath = null;
	if (convert) {
		basePath = air.File.applicationStorageDirectory.nativePath +
		air.File.separator;
	}
	var ar = [];
	var is = this.items();
	for(var i in is) {		
		ar.push(is[i].metadata(basePath))
	}
	return ar;
};

/**
 * Gets all a list of all the content objects in the manifest
 * @return ar List of all the content objects in the manifest 
 */
Manifest.prototype.items = function() {
	var ar = [];
	this.tbl.find('tr').each(function(k, v) {
		if($(v).data('content')) {
			ar.push($(v).data('content'));
		}
	});
	return ar;
};

/**
 * Updates the status of the project.
 * @param hitPublish Whether the project was just published
 */
Manifest.prototype.updateStatus = function(hitPublish, forceUpdate) {
    var status = this.get_metadata("status");
    var epoch_time = new Date().getTime();
    if (this.obj == null) {
	var versionModified = false;
	if(status == "Published" && !hitPublish) {
            this.set_metadata("status", "Modified");
            versionModified = true;
	}
        else if(status == "Modified" || status == "Unpublished") {
            if (hitPublish) {
                var new_version = "" + (parseInt(this.get_metadata("version"))+1);
                this.set_metadata("version", new_version);
                this.set_metadata("status", "Published");
                this.set_metadata("published", "" + epoch_time);
                versionModified = true;
                var items = this.items();
                for (var i = 0; i < items.length; i++){
                    var content = items[i];
                    if (content.type == "quiz") {
                        qManifest = new Manifest(content.path);
                        qManifest.updateStatus(true);
                        qManifest.save();
                    }
                    content.updateStatus(true);
                }
            }
	}
    }
	
    if(versionModified || forceUpdate) {
        this.set_metadata("update_time", "" + epoch_time);
        this.save_metadata();
    }
}

/**
 * Saves the manifest
 */
Manifest.prototype.save = function() {
	if (this.file != null) { 
		var data = this.data(true);
		this.file.val = JSON.stringify(data);
		this.file.flush();
		if (data.length == 0){
			var tr = $('<tr id="fillRow"/>');
			this.tbl.find('tbody').append(tr);
			tr.append($('<td colspan="5" class="fill">Click "'+$("#addButton").html()+'" to start editing.</td>'));
		}
	} else {
		if (this.obj != null){
			this.obj.attachments = this.items();
			if (this.obj.attachments.length == 0){
				this.tbl.hide();
			}
		}
	}
};

/**
 * Adds content to the manifest
 * Handles all the functionality that comes with the content such as
 * order, type, title, status and the remove button. The event handlers
 * and dialogs are declared as the content is added. 
 * @param content The content that is to be added to the manifest
 */
Manifest.prototype.addContent = function(content, is_new) {
	this.ordernum++;

        if(is_new) {
            this.updateStatus(false, true);
        }

        var this_manifest = this;  // for use in button click function below
	var quiz = this.obj;
	var on = this.ordernum;
	var tempoArray = this.tmpOrder;
	
	var manifest = this;
	$("#fillRow").remove();
	this.tbl.show();
	var tr = $('<tr class="fixheight" />');
	this.tbl.find('tbody').append(tr);

        // The order number (the order which the fields are displayed in) and the icon
	var rowid = "row" + this.ordernum; 
	var td = $('<td><input maxlength="3" id="' + rowid + '"\
	  class="numbering" type="text" name="number" size="2.5" value="'+ this.ordernum +'"/><br</td>'); 
	$("#" + rowid).live('blur', function() {
		tempoArray[content.id] = $(this).val();
	});
	tr.append(td);
	tr.append($('<td class="icon"><img src="' + content.icon + '"/></td>'));

        // This is the function that allows renaming of content within a project
        button = $('<button type="button" class="nice mini radius blue button">Settings</button>');
        button.click(function(e){
		var tr = $(this).parent().parent().parent().parent();
		var anchor = $(this).parent().parent().parent().find("a:first");
		var contentName = anchor.attr('name');
		$("#contentName").val(contentName);

                // This is the function that saves state once they click OK
                var func = function(e){
                    var name = $("#contentName").val();
                    
                    if(!is_valid_name(name)) {
                        $('#contentName').focus();
                        return false;
                    }

                    // Update the data structures and save it back to disk
                    tr.data('content').title = name;
                    tr.data('content').updateStatus(false, true);
                    this_manifest.updateStatus(false, true);
                    this_manifest.save();

                    if(this_manifest.parent_manifest) {
                        this_manifest.parent_manifest.updateStatus(false, true);
                    }

                    // Update the display
                    tr.find('.contentStatus').text(tr.data('content').status);
                    
                    // Update the display with the new name
                    anchor.attr('name', name);
                    apply_tooltip(anchor, name, 50);
                    anchor.text(shorten_long_name(name, 50));
                    return true;
		};

                $( "#dialog-settings" ).dialog({
                        width:450,
                        modal: true,
                        buttons: {
                                "Save": function() {
                                    if(func()) {
                                        $(this).dialog( "close" );
                                    }
                                },
                                Cancel: function() {
                                        $(this).dialog( "close" );
                                }
                        }
                });
	});

        // Add the title, including the (sometimes visible) rename button
        tmp_td = $('<td><div class="wrapper"><a class="title" href="#" name="' + content.title + '">' + shorten_long_name(content.title, 50, true) + '</a><div class="renameDiv"></div></div></td>');
        tmp_td.find('div').find('div.renameDiv').append(button);
        apply_tooltip(tmp_td.find('a:first'), content.title, 50);
        tr.append(tmp_td);
        tr.mouseover(function(e){$(this).find('div.renameDiv').show();return false;});
        tr.mouseout(function(e){$(this).find('div.renameDiv').hide();return false;});

	if (this.obj == null)
		tr.append($('<td><div class="contentStatus">'+content.status+'</div></td>'));
	tr.append($('<td class="icon"><img class="remove" src="icons/remove.png" alt="Remove Item" /></td>'));
	tr.data('content', content);

	var manifest = this;
	var cont = content;
	var sort = false;
	tr.find('input.numbering').keyup(
		function(e) {
			if(e.keyCode == '13') {		
				e.preventDefault();
				tempoArray[cont.id] = $(this).val();
				//Get the order array:
				var orderArray = [];
				orderArray.push("");
				//Get the order array
				var row = manifest.obj ? $('#mediaDiv table tbody tr') : $('#contentTable tbody tr');
				row.each(function(){
					if($(this).data('content'))
						orderArray.push($(this).data('content'));
				});
				//Rearrange the orderArray
				var tempCont;
				for(var id in tempoArray) {
					var newIndex = tempoArray[id];
					//Check if the index is in the range
					if(newIndex > 0 && newIndex < orderArray.length && !isNaN(newIndex)) { 
						//Get old index
						for(var oldIndex = 1; oldIndex < orderArray.length; oldIndex++) {
							if(orderArray[oldIndex].id == id) {
								tempCont = orderArray[oldIndex]; 
								break;
							}
						}
						//Now we have a new index (newIndex) and an old (oldIndex)
						//content should now be inserted in orderArray at newIndex and removed from oldIndex
						orderArray.splice(oldIndex, 1); 				//Remove
						orderArray.splice(newIndex, 0, tempCont); 	//Add
					}
				}
				//Need to repopulate the page with the order of orderArray
				var table = quiz ? $('#mediaDiv table')[0] : $('#contentTable')[0];
				for(var j = table.rows.length - 1; j > 0; j--) {
					table.deleteRow(j);
				}
				manifest.ordernum = 0;
				for(var p = 1; p < orderArray.length; p++)  {
                                    manifest.addContent(orderArray[p], false);
				}	
				manifest.tmpOrder = [];
			}
		}	
	);
	tr.find('img.remove').click(function() {
		manifest.confirm.dialog({
			height:240,
			modal: true,
			buttons: {
				"Delete Content": function() {
					tr.data('content').deleteFile();
					var id;
					if(manifest.tmpOrder[id]) {
						manifest.tmpOrder.splice(id, 1);
					}
					// update numbers displayed below row to be deleted.
					var rowIndex = tr[0].sectionRowIndex;
					var rows = tr.parent().children();
					for (var i = rowIndex+1; i < rows.length; i++){
						var tRow = rows[i];
						$(tRow).find('input.numbering').val(parseInt($(tRow).find('input.numbering').val())-1);
					}
					tr.remove();
					manifest.updateStatus(false);
					manifest.save();
					bottomBar($('#contentTable').height() - 34, $(window).height());
					$( this ).dialog( "close" );
				},
				Cancel: function() {					
					$( this ).dialog( "close" );
				}
			}
		});
	});
	tr.find('a').click(function() {
		var c = tr.data('content');
		manifest.edit.empty();
		if(c.render(manifest.edit)) {
			manifest.edit.dialog({
				autoOpen: true,
				modal: true,
				width: 550,
				height:600,
				position: 'top',
				beforeClose: function(event) {
					var result = true;
					if (!c._saved && (c.wasModified())){ 
				     	c._confirm.dialog({
							height:240,
							modal: true,
							buttons: {
								"Discard changes": function(event) {
                                
                                    //Check if the image was replaced
                                    //If so, delete the temp media object and 
                                    //set c_tmpObj back to null
                                    if(c._tmpObj) {
										  c._tmpObj.deleteFile();
                                          c._tmpObj = null;
                                    }
									c.unrender();
									$( this ).dialog( "close" );
									manifest.edit.dialog("close");
									return true;
									
								},
								Cancel: function(event) {
									$( this ).dialog( "close" );
									return false;
								}
							}
						});
					} else {
						c.unrender();
						return true;
					}
					return false;
				 },
				buttons: {
					"Save": function() {
                        //If the media file was replaced. Replace the old file
                        //with the new one
						c.save();
						c.unrender();
                        if(c._tmpObj) {							
                        	c.deleteFile();
							c._tmpObj.status = c.status;
                            c = c._tmpObj;
                            c._tmpObj = null;
							c.save();
							
                        } 
						c.updateStatus(false);						
						tr.find('.contentStatus').text(c.status);
						manifest.updateStatus(false);
						var cTitle = shorten_long_name(c.title, 50);
						tr.find('a').text(cTitle);
						tr.data('content', c);
						manifest.save();
						$(this).dialog("close"); 
						return true;
					} 
				}
			});
			    var myToolbar = [ { name: 'basicstyles', items : [ 'Bold','Italic','Underline' ] },
								  { name: 'paragraph', items : [ 'NumberedList','BulletedList','-', 
								   'JustifyLeft','JustifyCenter','JustifyRight','JustifyBlock' ] },
							 	   { name: 'clipboard', items : [ 'Undo','Redo'] },
							 	   { name: 'basicstyles', items: ['RemoveFormat'] }];
				if(c.type != "question") {
					if(CKEDITOR.instances.editor1) 
						CKEDITOR.instances.editor1.destroy(true);
					CKEDITOR.replace( 'editor1', {
						toolbar: myToolbar
					});
				}
				else {
					if(CKEDITOR.instances.editor2) 
						CKEDITOR.instances.editor2.destroy(true);
					CKEDITOR.replace( 'editor2', {
						toolbar: myToolbar,
						resize_enabled: false,
						width: 513,
						height: 150,
						enableTabKeyTools: false,
						tabSpaces: 4
					});
				}
		}
		return false;
	});
	this.save();
};

// --------------------------------------------
//   Metadata functions
// --------------------------------------------

// Metadata defaults - to be used the first time or if metadata is somehow missing.
Manifest.prototype.get_metadata_defaults = function() {
    defaults = {
        "version":     "0",
        "status":      "Unpublished",
        "tincan":      "no-reporting",
        "update_time": new Date().getTime(),  // Set the update time to right now
        // Add further defaults here
    };
    return defaults;
}

// If supplied a key, return that key's value.
// If no key is given return the whole hash.
Manifest.prototype.get_metadata = function(key) {
    if(key != null) {
        return this.metadata[key];
    }
    return this.metadata;
};

// Set the specified key, val pair
Manifest.prototype.set_metadata = function(key, val) {
    this.metadata[key] = val;
};

// We store the metadata as a file on disk that is just stringified JSON.
// This function returns the path at which we write the file.
Manifest.prototype.get_metadata_path = function() {
    var vFile = new FileCache(this.path + air.File.separator + 'version');
    return vFile;
}

// Persist to disk
Manifest.prototype.save_metadata = function() {
    var f = this.get_metadata_path();
    f.val = JSON.stringify(this.get_metadata());
    f.flush();
};

// Load from disk
// Also, update metadata if necessary
Manifest.prototype.load_metadata = function() {
    var vFile = this.get_metadata_path();
    var defaults = this.get_metadata_defaults();
    
    if(!vFile.val) {
        this.metadata = defaults;
    }
    else {
        this.metadata = JSON.parse(vFile.val);
    
        // If the "update_time" is missing we want to try to populate it smartly.
        // We'll do what we used to do - check the file system for the most recently changed file.
        if(!("update_time" in this.metadata)) {
            this.metadata["update_time"] = recursiveModified(this.path);
        }

        // Old MASLO packs will be missing some important metadata.  We want to make upgrading
        // seamless so we will look for that here and apply default values in case any are missing.
        for(var i in defaults) {
            if(!(i in this.metadata)) {
                this.metadata[i] = defaults[i];
            }
        } 
    }
};

// --------------------------------------------
//   End of metadata functions
// --------------------------------------------



/**
 * Creates a zip file of the manifest
 */
Manifest.prototype.zip = function() {
	var zipName = air.File.applicationStorageDirectory.nativePath +
		air.File.separator + "contents.zip";
	var zipFile = new air.File(zipName);
	var writer = new window.runtime.com.coltware.airxzip.ZipFileWriter();
	writer.open(zipFile);
	var currentFolder = new air.File(this.path);
	var utfProjectName = urlencode(""+this.projectName)
	writer.addDirectory(utfProjectName);
	
	function addData(prefix, dirFile){
		var files = dirFile.getDirectoryListing();
		for (var i = 0; i < files.length; i++){
			var ultiPrefix = "";
			var nPrefix = [];
			for (var j = 0; j < prefix.length; j++){
				ultiPrefix += urlencode(prefix[j]) + air.File.separator;
				nPrefix.push(prefix[j]);
			}
			nPrefix.push(files[i].name);
			if (files[i].isDirectory) {
                if (files[i].name !="." && files[i].name !="..") {
					var nDir = new air.File(files[i].nativePath);					
					var encPrefix = ultiPrefix + files[i].name;	
					writer.addDirectory(encPrefix);
					addData(nPrefix, nDir);
				}
			} else {
				var nFile = new air.File(files[i].nativePath);				
				var utfFileName = ultiPrefix + files[i].name;
				writer.addFile(nFile,utfFileName);
			}
		}
		return false;	
	};
	
	var res = addData([this.projectName], currentFolder);
	writer.close();
	
};
