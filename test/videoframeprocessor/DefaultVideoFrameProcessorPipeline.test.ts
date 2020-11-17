// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as chai from 'chai';
import * as sinon from 'sinon';
import { stub } from 'sinon';

import NoOpDebugLogger from '../../src/logger/NoOpDebugLogger';
import TimeoutScheduler from '../../src/scheduler/TimeoutScheduler';
import CanvasVideoFrameBuffer from '../../src/videoframeprocessor/CanvasVideoFrameBuffer';
import DefaultVideoFrameProcessorPipeline from '../../src/videoframeprocessor/DefaultVideoFrameProcessorPipeline';
import NoOpVideoFrameProcessor from '../../src/videoframeprocessor/NoOpVideoFrameProcessor';
import VideoFrameBuffer from '../../src/videoframeprocessor/VideoFrameBuffer';
import VideoFrameProcessor from '../../src/videoframeprocessor/VideoFrameProcessor';
import VideoFrameProcessorPipelineObserver from '../../src/videoframeprocessor/VideoFrameProcessorPipelineObserver';
import DOMMockBehavior from '../dommock/DOMMockBehavior';
import DOMMockBuilder from '../dommock/DOMMockBuilder';

describe('DefaultVideoFrameProcessorPipeline', () => {
  const assert: Chai.AssertStatic = chai.assert;
  const expect: Chai.ExpectStatic = chai.expect;
  const logger = new NoOpDebugLogger();
  const mockStreamId: string = 'test-stream';
  let pipe: DefaultVideoFrameProcessorPipeline;
  let domMockBehavior: DOMMockBehavior;
  let domMockBuilder: DOMMockBuilder;
  let mockVideoStream: MediaStream;
  let mockVideoTrack: MediaStreamTrack;
  let proc: VideoFrameProcessor;

  class MockObserver implements VideoFrameProcessorPipelineObserver {
    processingDidFailToStart = sinon.stub();
    processingDidStop = sinon.stub();
    processingLatencyTooHigh = sinon.stub();
    processingDidStart = sinon.stub();
  }

  beforeEach(() => {
    domMockBehavior = new DOMMockBehavior();
    domMockBuilder = new DOMMockBuilder(domMockBehavior);
    domMockBehavior.createElementCaptureStream = new MediaStream();
    mockVideoStream = new MediaStream();
    // @ts-ignore
    mockVideoStream.id = mockStreamId;
    // @ts-ignore
    mockVideoTrack = new MediaStreamTrack('attach-media-input-task-video-track-id', 'video');
    mockVideoStream.addTrack(mockVideoTrack);
    proc = new NoOpVideoFrameProcessor();
    pipe = new DefaultVideoFrameProcessorPipeline(logger, [proc]);
  });

  afterEach(() => {
    if (domMockBuilder) {
      domMockBuilder.cleanup();
    }
  });

  describe('construction', () => {
    it('can be constructed', () => {
      assert.exists(pipe);
    });
  });

  describe('setInputMediaStream', () => {
    it('can set the input', async () => {
      await pipe.setInputMediaStream(mockVideoStream);
      const outputStream = await pipe.getInputMediaStream();
      expect(outputStream.id).to.equal(mockStreamId);
      await pipe.setInputMediaStream(null);
    });

    it('can only set MediaStream with video tracks', async () => {
      const emptyStream = new MediaStream();
      await pipe.setInputMediaStream(emptyStream);
      const outputStream = await pipe.getInputMediaStream();
      expect(outputStream).to.equal(null);
      await pipe.setInputMediaStream(null);
    });

    it('can stop the pipeline multiple times', async () => {
      await pipe.setInputMediaStream(null);
      const outputStream = await pipe.getInputMediaStream();
      expect(outputStream).to.equal(null);
      await pipe.setInputMediaStream(null);
    });

    it('can start the pipeline with valid stream and stop with null', async () => {
      const pipeObserver = new MockObserver();
      const procs = [new NoOpVideoFrameProcessor()];
      pipe.processors = procs;
      pipe.addObserver(pipeObserver);
      await pipe.setInputMediaStream(mockVideoStream);
      await pipe.setInputMediaStream(null);
    });

    it('can start the pipeline with valid stream and stop with null', done => {
      const pipeObserver = new MockObserver();
      const procs = [new NoOpVideoFrameProcessor()];
      pipe.processors = procs;
      pipe.addObserver(pipeObserver);
      pipe.setInputMediaStream(mockVideoStream);
      new TimeoutScheduler(300).start(() => {
        expect(pipeObserver.processingDidStart.called).to.eq(true);
        pipe.setInputMediaStream(null);
      });

      new TimeoutScheduler(350).start(() => {
        expect(pipeObserver.processingDidStop.called).to.eq(true);
        done();
      });
    });

    it('can start the pipeline with valid stream and dumb processor and stop with null', done => {
      let started = 0;
      let stopped = 0;
      class PipeObserver implements VideoFrameProcessorPipelineObserver {
        processingDidStart(): void {
          started = 1;
        }

        processingDidStop(): void {
          stopped = 1;
        }
      }

      class DummyProcessor extends NoOpVideoFrameProcessor {
        width = 0;
        height = 0;
        canvas = document.createElement('canvas');
        process(_buffers: VideoFrameBuffer[]): Promise<VideoFrameBuffer[]> {
          this.canvas.width = this.width;
          this.canvas.height = this.height;
          this.width += 1;
          this.height += 1;
          return Promise.resolve([new CanvasVideoFrameBuffer(this.canvas)]);
        }
      }
      const pipeObserver = new PipeObserver();
      const procs = [new DummyProcessor()];
      pipe.processors = procs;
      pipe.addObserver(pipeObserver);
      pipe.setInputMediaStream(mockVideoStream);
      new TimeoutScheduler(400).start(() => {
        expect(started).to.equal(1);
        pipe.setInputMediaStream(null);
      });

      new TimeoutScheduler(500).start(() => {
        expect(stopped).to.equal(1);
        done();
      });
    });

    it('can fail to start pipeline and fire callback if buffers are destroyed', done => {
      class DummyProcessor implements VideoFrameProcessor {
        name(): string {
          return '';
        }
        destroy(): Promise<void> {
          return;
        }
        width = 0;
        height = 0;
        canvas = document.createElement('canvas');
        process(_buffers: VideoFrameBuffer[]): Promise<VideoFrameBuffer[]> {
          this.canvas.width = this.width;
          this.canvas.height = this.height;
          this.width += 1;
          this.height += 1;
          const buffer = new CanvasVideoFrameBuffer(this.canvas);
          buffer.destroy();
          return Promise.resolve([buffer]);
        }
      }

      class EmptyMockObserver implements VideoFrameProcessorPipelineObserver {}
      const pipeObserver = new MockObserver();
      const pipeObserver2 = new EmptyMockObserver();
      const procs = [new DummyProcessor()];
      pipe.processors = procs;
      pipe.addObserver(pipeObserver);
      pipe.addObserver(pipeObserver2);
      pipe.setInputMediaStream(mockVideoStream);
      new TimeoutScheduler(300).start(() => {
        expect(pipeObserver.processingDidFailToStart.called).to.equal(true);
        pipe.setInputMediaStream(null);
      });

      new TimeoutScheduler(350).start(() => {
        expect(pipeObserver.processingDidFailToStart.called).to.equal(true);
        expect(pipeObserver.processingDidStart.called).to.equal(false);
        done();
      });
    });
  });

  describe('getInputMediaStream', () => {
    it('can get the input', async () => {
      let inputStream = await pipe.getInputMediaStream();
      expect(inputStream).to.be.null;

      await pipe.setInputMediaStream(mockVideoStream);
      inputStream = await pipe.getInputMediaStream();
      expect(inputStream.id).to.equal(mockStreamId);
      await pipe.setInputMediaStream(null);
    });
  });

  describe('getActiveOutputMediaStream', () => {
    it('can get an active output stream', async () => {
      const activeStream = new MediaStream();
      // @ts-ignore
      activeStream.active = true;
      domMockBehavior.createElementCaptureStream = activeStream;
      const outputStream = pipe.getActiveOutputMediaStream();
      expect(outputStream).to.deep.equal(activeStream);
      // disable the output stream to trigger a recapture
      // @ts-ignore
      activeStream.active = false;
      const activeStream2 = new MediaStream();
      // @ts-ignore
      activeStream2.active = true;
      domMockBehavior.createElementCaptureStream = activeStream2;
      expect(pipe.getActiveOutputMediaStream()).to.deep.equal(activeStream2);
    });

    it('can get the same output stream', async () => {
      const activeStream = new MediaStream();
      // @ts-ignore
      activeStream.active = true;
      domMockBehavior.createElementCaptureStream = activeStream;
      const outputStream = pipe.getActiveOutputMediaStream();
      const outputStream2 = pipe.getActiveOutputMediaStream();
      expect(outputStream2).to.deep.equal(outputStream);
    });
  });

  describe('getter outputMediaStream', () => {
    it('can get current output stream', async () => {
      const activeStream = new MediaStream();
      // @ts-ignore
      activeStream.active = true;
      domMockBehavior.createElementCaptureStream = activeStream;
      const outputStream = pipe.getActiveOutputMediaStream();
      expect(outputStream).to.deep.equal(activeStream);
    });
  });

  describe('addObserver', () => {
    it('can add observer', () => {
      const pipeObserver = new MockObserver();
      pipe.addObserver(pipeObserver);
    });
  });

  describe('removeObserver', () => {
    it('can remove observer', () => {
      const pipeObserver = new MockObserver();
      pipe.addObserver(pipeObserver);
      pipe.removeObserver(pipeObserver);
    });
  });

  describe('setter processors', () => {
    it('can set the input processors', async () => {
      class NullProcessor implements VideoFrameProcessor {
        name(): string {
          throw new Error('Method not implemented.');
        }
        destroy(): Promise<void> {
          throw new Error('Method not implemented.');
        }
        process(_buffers: VideoFrameBuffer[]): Promise<VideoFrameBuffer[]> {
          return Promise.resolve(null);
        }
      }
      const procs = [new NoOpVideoFrameProcessor(), new NullProcessor()];
      pipe.processors = procs;
    });

    it('can set the processor and fail to start due to errors', done => {
      let called = false;
      let notCalled = true;
      class PipeObserver implements VideoFrameProcessorPipelineObserver {
        processingDidFailToStart(): void {
          called = true;
        }
      }

      class PipeObserver2 implements VideoFrameProcessorPipelineObserver {
        processingDidStart(): void {
          notCalled = false;
        }
      }
      const pipeObserver = new PipeObserver();
      const pipeObserver2 = new PipeObserver2();
      pipe.addObserver(pipeObserver);
      pipe.addObserver(pipeObserver2);

      class WrongProcessor implements VideoFrameProcessor {
        name(): string {
          throw new Error('Method not implemented.');
        }
        destroy(): Promise<void> {
          throw new Error('Method not implemented.');
        }
        process(_buffers: VideoFrameBuffer[]): Promise<VideoFrameBuffer[]> {
          throw new Error('Method not implemented.');
        }
      }
      const procs = [new WrongProcessor()];
      pipe.processors = procs;
      pipe.setInputMediaStream(mockVideoStream);

      new TimeoutScheduler(200).start(() => {
        expect(called).to.equal(true);
        expect(notCalled).to.equal(true);

        pipe.setInputMediaStream(null);

        done();
      });
    });

    it('can set slow processor and fires processingLatencyTooHigh', done => {
      let called = false;
      class PipeObserver implements VideoFrameProcessorPipelineObserver {
        processingLatencyTooHigh(_latencyMs: number): void {
          called = true;
        }
      }

      class PipeObserver2 implements VideoFrameProcessorPipelineObserver {
        processingDidStart(): void {}
      }
      const pipeObserver = new PipeObserver();
      const pipeObserver2 = new PipeObserver2();
      pipe.addObserver(pipeObserver);
      pipe.addObserver(pipeObserver2);

      class WrongProcessor implements VideoFrameProcessor {
        name(): string {
          throw new Error('Method not implemented.');
        }
        destroy(): Promise<void> {
          throw new Error('Method not implemented.');
        }
        async process(buffers: VideoFrameBuffer[]): Promise<VideoFrameBuffer[]> {
          await new Promise(resolve => setTimeout(resolve, (1000 / 15) * 3));
          return buffers;
        }
      }
      const procs = [new WrongProcessor()];
      pipe.processors = procs;
      pipe.setInputMediaStream(mockVideoStream);

      // simulate high latency, has to wait long enough for the callback to be fired.
      new TimeoutScheduler(800).start(() => {
        expect(called).to.equal(true);

        pipe.setInputMediaStream(null);

        done();
      });
    });
  });

  describe('getter processors', () => {
    it('can get processors', () => {
      const procs = [new NoOpVideoFrameProcessor()];
      pipe.processors = procs;
      expect(pipe.processors).to.deep.equal(procs);
    });
  });

  describe('stop', () => {
    it('can stop the processing', async () => {
      const obs = new MockObserver();

      const procs = [new NoOpVideoFrameProcessor()];
      pipe.processors = procs;
      pipe.addObserver(obs);
      await pipe.setInputMediaStream(mockVideoStream);

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(obs.processingDidStart.called).to.equal(true);
      pipe.stop();
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(obs.processingDidStop.called).to.equal(true);
    });
  });

  describe('destroy', () => {
    it('can stop the processing', async () => {
      const obs = new MockObserver();
      const procs = [new NoOpVideoFrameProcessor()];
      pipe.processors = procs;
      pipe.addObserver(obs);
      await pipe.setInputMediaStream(mockVideoStream);

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(obs.processingDidStart.called).to.equal(true);
      pipe.destroy();
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(obs.processingDidStop.called).to.equal(true);
    });

    it('can destroy processors if they exist', async () => {
      pipe.processors = null;
      pipe.destroy();

      class MockProcessor extends NoOpVideoFrameProcessor {
        destroy = stub();
      }
      const obs = new MockObserver();
      const procs = [new MockProcessor()];
      pipe.processors = procs;
      pipe.addObserver(obs);
      await pipe.setInputMediaStream(mockVideoStream);

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(obs.processingDidStart.called).to.equal(true);
      pipe.destroy();
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(obs.processingDidStop.called).to.equal(true);
      expect(procs[0].destroy.called).to.equal(true);
    });
  });
});
