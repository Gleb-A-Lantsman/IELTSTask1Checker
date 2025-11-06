const https = require('https');

exports.handler = async function(event, context) {
  // Enable CORS
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers
    };
  }

  try {
    const category = event.queryStringParameters?.category;
    
    if (!category) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: true, 
          message: 'Category parameter is required' 
        })
      };
    }

    const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
    
    if (!DROPBOX_ACCESS_TOKEN) {
      console.error('DROPBOX_ACCESS_TOKEN not set');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: true, 
          message: 'Dropbox not configured' 
        })
      };
    }

    // Map category to Dropbox folder path
    const folderPaths = {
      'table': '/table',
      'line-graph': '/line-graph',
      'bar-chart': '/bar-chart',
      'pie-chart': '/pie-chart',
      'flowchart': '/flowchart',
      'maps': '/maps'
    };

    const folderPath = folderPaths[category];
    
    if (!folderPath) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: true, 
          message: 'Invalid category' 
        })
      };
    }

    // List files in Dropbox folder
    const listResponse = await dropboxApiRequest(
      'https://api.dropboxapi.com/2/files/list_folder',
      DROPBOX_ACCESS_TOKEN,
      {
        path: folderPath,
        limit: 100
      }
    );

    // Filter for image files only
    const imageFiles = listResponse.entries.filter(entry => {
      const name = entry.name.toLowerCase();
      return entry['.tag'] === 'file' && 
             (name.endsWith('.jpg') || name.endsWith('.jpeg') || 
              name.endsWith('.png') || name.endsWith('.gif'));
    });

    // Get shared links for each image
    const images = [];
    
    for (const file of imageFiles) {
      try {
        // Try to get existing shared link
        const sharedLinkResponse = await dropboxApiRequest(
          'https://api.dropboxapi.com/2/sharing/list_shared_links',
          DROPBOX_ACCESS_TOKEN,
          {
            path: file.path_lower,
            direct_only: true
          }
        );

        let url;
        if (sharedLinkResponse.links && sharedLinkResponse.links.length > 0) {
          // Use existing shared link
          url = sharedLinkResponse.links[0].url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
        } else {
          // Create new shared link
          const createLinkResponse = await dropboxApiRequest(
            'https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings',
            DROPBOX_ACCESS_TOKEN,
            {
              path: file.path_lower,
              settings: {
                requested_visibility: 'public'
              }
            }
          );
          url = createLinkResponse.url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
        }

        images.push({
          name: file.name,
          url: url,
          path: file.path_lower
        });
      } catch (error) {
        console.error(`Error getting shared link for ${file.name}:`, error.message);
        // Continue with other files even if one fails
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        category,
        images,
        count: images.length
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: true, 
        message: error.message || 'Failed to fetch images from Dropbox'
      })
    };
  }
};

// Helper function to make Dropbox API requests
function dropboxApiRequest(url, token, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(url, options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsedData);
          } else {
            reject(new Error(parsedData.error_summary || `HTTP ${res.statusCode}`));
          }
        } catch (error) {
          reject(new Error('Failed to parse Dropbox response'));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}
