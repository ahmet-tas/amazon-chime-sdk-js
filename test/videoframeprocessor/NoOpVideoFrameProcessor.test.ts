// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as chai from 'chai';
import { expect } from 'chai';

import CanvasVideoFrameBuffer from '../../src/videoframeprocessor/CanvasVideoFrameBuffer';
import NoOpVideoFrameProcessor from '../../src/videoframeprocessor/NoOpVideoFrameProcessor';
import VideoFrameBuffer from '../../src/videoframeprocessor/VideoFrameBuffer';

describe('NoOpVideoFrameProcessor', () => {
  const assert: Chai.AssertStatic = chai.assert;
  let proc: NoOpVideoFrameProcessor;
  beforeEach(() => {
    proc = new NoOpVideoFrameProcessor();
  });
  describe('construction', () => {
    it('can be constructed', () => {
      assert.exists(proc);
    });
  });

  describe('name', () => {
    it('returns name of the processor', () => {
      expect(proc.name()).to.equal('NoOp');
    });
  });

  describe('process', () => {
    it('passes through the buffers', async () => {
      const buffers: VideoFrameBuffer[] = [];
      let output = await proc.process(buffers);
      expect(output).to.deep.equal(buffers);
      buffers.push(new CanvasVideoFrameBuffer(null));
      output = await proc.process(buffers);
      expect(output).to.deep.equal(buffers);
    });
  });

  describe('destroy', () => {
    it('is no-op', async () => {
      await proc.destroy();
    });
  });
});
