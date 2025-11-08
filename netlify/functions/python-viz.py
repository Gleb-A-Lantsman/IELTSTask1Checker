#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import base64
import io
import sys
import traceback

def handler(event, context):
    """
    Netlify Python function to execute matplotlib code.
    """
    try:
        # Parse request
        if event.get('httpMethod') != 'POST':
            return {
                'statusCode': 405,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'Method not allowed'})
            }
        
        # Get body
        body = event.get('body', '')
        if event.get('isBase64Encoded'):
            body = base64.b64decode(body).decode('utf-8')
        
        data = json.loads(body) if body else {}
        python_code = data.get('code', '')
        
        if not python_code:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'error': 'No code provided', 'success': False})
            }
        
        # Import after validation
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import pandas as pd
        import numpy as np
        
        # Execute code
        namespace = {'plt': plt, 'pd': pd, 'np': np, 'matplotlib': matplotlib}
        exec(python_code, namespace)
        
        # Save to buffer
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        buf.seek(0)
        
        # Encode
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        
        # Cleanup
        plt.close('all')
        buf.close()
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'image': img_base64, 'success': True})
        }
        
    except Exception as e:
        error_traceback = traceback.format_exc()
        print(f"Error: {error_traceback}", file=sys.stderr)
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': str(e),
                'traceback': error_traceback,
                'success': False
            })
        }
